-- Migration 043: Multi-Project Data Isolation Schema & RPC Updates

-- 1. Add kode_proyek column to core tables (default '524006')
ALTER TABLE absen_karyawan ADD COLUMN IF NOT EXISTS kode_proyek TEXT DEFAULT '524006';
ALTER TABLE absen_harian ADD COLUMN IF NOT EXISTS kode_proyek TEXT DEFAULT '524006';
ALTER TABLE absen_scan_wajah ADD COLUMN IF NOT EXISTS kode_proyek TEXT DEFAULT '524006';
ALTER TABLE absen_jadwal_slot ADD COLUMN IF NOT EXISTS kode_proyek TEXT DEFAULT '524006';
ALTER TABLE absen_kalender ADD COLUMN IF NOT EXISTS kode_proyek TEXT DEFAULT '524006';
ALTER TABLE absen_laporan_terlewat ADD COLUMN IF NOT EXISTS kode_proyek TEXT DEFAULT '524006';
ALTER TABLE absen_izin ADD COLUMN IF NOT EXISTS kode_proyek TEXT DEFAULT '524006';

-- Ensure all existing rows belong to default project 524006 if NULL
UPDATE absen_karyawan SET kode_proyek = '524006' WHERE kode_proyek IS NULL;
UPDATE absen_harian SET kode_proyek = '524006' WHERE kode_proyek IS NULL;
UPDATE absen_scan_wajah SET kode_proyek = '524006' WHERE kode_proyek IS NULL;
UPDATE absen_jadwal_slot SET kode_proyek = '524006' WHERE kode_proyek IS NULL;
UPDATE absen_kalender SET kode_proyek = '524006' WHERE kode_proyek IS NULL;
UPDATE absen_laporan_terlewat SET kode_proyek = '524006' WHERE kode_proyek IS NULL;
UPDATE absen_izin SET kode_proyek = '524006' WHERE kode_proyek IS NULL;

-- Create indexes for high performance project filtering
CREATE INDEX IF NOT EXISTS idx_karyawan_kode_proyek ON absen_karyawan (kode_proyek);
CREATE INDEX IF NOT EXISTS idx_harian_kode_proyek ON absen_harian (kode_proyek);
CREATE INDEX IF NOT EXISTS idx_scan_wajah_kode_proyek ON absen_scan_wajah (kode_proyek);
CREATE INDEX IF NOT EXISTS idx_jadwal_slot_kode_proyek ON absen_jadwal_slot (kode_proyek);
CREATE INDEX IF NOT EXISTS idx_kalender_kode_proyek ON absen_kalender (kode_proyek);
CREATE INDEX IF NOT EXISTS idx_laporan_terlewat_kode_proyek ON absen_laporan_terlewat (kode_proyek);
CREATE INDEX IF NOT EXISTS idx_izin_kode_proyek ON absen_izin (kode_proyek);

-- 2. Update absen_list_karyawan RPC to filter by p_kode_proyek
CREATE OR REPLACE FUNCTION absen_list_karyawan(p_kode_proyek TEXT DEFAULT NULL)
RETURNS SETOF absen_karyawan AS $$
BEGIN
  IF p_kode_proyek IS NULL OR TRIM(p_kode_proyek) = '' THEN
    RETURN QUERY SELECT * FROM absen_karyawan ORDER BY nama;
  ELSE
    RETURN QUERY SELECT * FROM absen_karyawan WHERE kode_proyek = TRIM(p_kode_proyek) ORDER BY nama;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update absen_import_karyawan RPC to accept p_kode_proyek
CREATE OR REPLACE FUNCTION absen_import_karyawan(p_data jsonb, p_kode_proyek TEXT DEFAULT '524006')
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_nama text;
  v_uid text;
  v_mandor text;
  v_jabatan text;
  v_existing_id uuid;
  v_mandor_id uuid;
  v_added int := 0;
  v_updated int := 0;
  v_skipped int := 0;
  v_errors text[] := '{}';
  v_idx int := 0;
  v_target_kode text;
BEGIN
  IF absen_get_user_role() NOT IN ('admin','hrd') THEN
    RAISE EXCEPTION 'Hanya Admin atau HRD yang dapat mengimport karyawan';
  END IF;

  v_target_kode := COALESCE(NULLIF(TRIM(p_kode_proyek), ''), '524006');

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data) LOOP
    v_idx := v_idx + 1;
    v_nama := TRIM(v_item->>'nama');
    v_uid := TRIM(v_item->>'uid_mesin');
    v_mandor := TRIM(v_item->>'mandor');
    v_jabatan := TRIM(v_item->>'jabatan');

    IF v_nama IS NULL OR v_nama = '' THEN
      v_errors := array_append(v_errors, format('Baris %s: Nama kosong', v_idx));
      CONTINUE;
    END IF;

    -- Resolve mandor_id
    v_mandor_id := NULL;
    IF v_mandor IS NOT NULL AND v_mandor <> '' AND v_mandor <> '-' THEN
      SELECT id INTO v_mandor_id
      FROM absen_karyawan
      WHERE lower(nama) = lower(v_mandor) AND kode_proyek = v_target_kode AND status_aktif = true
      LIMIT 1;

      IF v_mandor_id IS NULL THEN
        INSERT INTO absen_karyawan (nama, jabatan, status_aktif, kode_proyek)
        VALUES (v_mandor, 'Mandor', true, v_target_kode)
        RETURNING id INTO v_mandor_id;
      END IF;
    END IF;

    -- Check existing worker by UID or Name within the same project
    v_existing_id := NULL;
    IF v_uid IS NOT NULL AND v_uid <> '' THEN
      SELECT id INTO v_existing_id
      FROM absen_karyawan
      WHERE v_uid = ANY(uid_mesin) AND kode_proyek = v_target_kode
      LIMIT 1;
    END IF;

    IF v_existing_id IS NULL THEN
      SELECT id INTO v_existing_id
      FROM absen_karyawan
      WHERE lower(nama) = lower(v_nama) AND kode_proyek = v_target_kode
      LIMIT 1;
    END IF;

    IF v_existing_id IS NOT NULL THEN
      UPDATE absen_karyawan
      SET
        jabatan = COALESCE(NULLIF(v_jabatan, ''), jabatan),
        atasan_id = COALESCE(v_mandor_id, atasan_id),
        uid_mesin = CASE
          WHEN v_uid IS NOT NULL AND v_uid <> '' AND NOT (v_uid = ANY(uid_mesin))
          THEN array_append(uid_mesin, v_uid)
          ELSE uid_mesin
        END,
        updated_at = now()
      WHERE id = v_existing_id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO absen_karyawan (nama, uid_mesin, jabatan, atasan_id, status_aktif, kode_proyek)
      VALUES (
        v_nama,
        CASE WHEN v_uid IS NOT NULL AND v_uid <> '' THEN ARRAY[v_uid] ELSE '{}'::text[] END,
        NULLIF(v_jabatan, ''),
        v_mandor_id,
        true,
        v_target_kode
      );
      v_added := v_added + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'added', v_added,
    'updated', v_updated,
    'skipped', v_skipped,
    'errors', v_errors
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update absen_tambah_karyawan RPC
CREATE OR REPLACE FUNCTION absen_tambah_karyawan(p_data jsonb, p_kode_proyek TEXT DEFAULT '524006')
RETURNS jsonb AS $$
DECLARE
  v_nama text;
  v_uid_arr text[];
  v_new_id uuid;
  v_target_kode text;
BEGIN
  IF absen_get_user_role() NOT IN ('admin','hrd') THEN
    RAISE EXCEPTION 'Hanya Admin atau HRD yang dapat menambah karyawan';
  END IF;

  v_nama := TRIM(p_data->>'nama');
  IF v_nama IS NULL OR v_nama = '' THEN
    RAISE EXCEPTION 'Nama karyawan wajib diisi';
  END IF;

  v_target_kode := COALESCE(NULLIF(TRIM(p_kode_proyek), ''), '524006');
  SELECT array_agg(TRIM(x)) INTO v_uid_arr FROM jsonb_array_elements_text(p_data->'uid_mesin') x;

  INSERT INTO absen_karyawan (
    nama, jabatan, uid_mesin, gaji_bulanan, tunjangan,
    tgl_masuk, status_aktif, atasan_id, no_hp, pin, kode_proyek
  ) VALUES (
    v_nama,
    NULLIF(TRIM(p_data->>'jabatan'), ''),
    COALESCE(v_uid_arr, '{}'::text[]),
    COALESCE((p_data->>'gaji_bulanan')::numeric, 0),
    COALESCE((p_data->>'tunjangan')::numeric, 0),
    (p_data->>'tgl_masuk')::date,
    COALESCE((p_data->>'status_aktif')::boolean, true),
    (p_data->>'atasan_id')::uuid,
    NULLIF(TRIM(p_data->>'no_hp'), ''),
    NULLIF(TRIM(p_data->>'pin'), ''),
    v_target_kode
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
