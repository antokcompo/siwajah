-- ============================================================
-- RPC Functions untuk CRUD Karyawan (SECURITY DEFINER)
-- Bypass RLS agar import & edit bisa berjalan
-- ============================================================

-- Import bulk karyawan dari Excel
CREATE OR REPLACE FUNCTION absen_import_karyawan(p_data jsonb)
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_added integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_errors text[] := '{}';
  v_existing_id uuid;
  v_uid text;
  v_nama text;
  v_jabatan text;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_uid := v_item->>'uid_mesin';
    v_nama := v_item->>'nama';
    v_jabatan := v_item->>'jabatan';

    -- Check if UID already exists
    SELECT id INTO v_existing_id
    FROM absen_karyawan
    WHERE v_uid = ANY(uid_mesin)
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Update jabatan if different
      IF v_jabatan IS NOT NULL AND v_jabatan != '' THEN
        UPDATE absen_karyawan
        SET jabatan = v_jabatan, updated_at = now()
        WHERE id = v_existing_id AND (jabatan IS NULL OR jabatan != v_jabatan);

        IF FOUND THEN
          v_updated := v_updated + 1;
        ELSE
          v_skipped := v_skipped + 1;
        END IF;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    ELSE
      -- Insert new
      BEGIN
        INSERT INTO absen_karyawan (nama, uid_mesin, jabatan, status_aktif)
        VALUES (v_nama, ARRAY[v_uid], NULLIF(v_jabatan, ''), true);
        v_added := v_added + 1;
      EXCEPTION WHEN OTHERS THEN
        v_errors := array_append(v_errors, v_nama || ': ' || SQLERRM);
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'added', v_added,
    'updated', v_updated,
    'skipped', v_skipped,
    'errors', v_errors
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tambah satu karyawan
CREATE OR REPLACE FUNCTION absen_tambah_karyawan(p_data jsonb)
RETURNS jsonb AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO absen_karyawan (nama, uid_mesin, jabatan, gaji_bulanan, tunjangan, tgl_masuk, status_aktif, atasan_id)
  VALUES (
    p_data->>'nama',
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_data->'uid_mesin') x), '{}'),
    NULLIF(p_data->>'jabatan', ''),
    COALESCE((p_data->>'gaji_bulanan')::numeric, 0),
    COALESCE((p_data->>'tunjangan')::numeric, 0),
    NULLIF(p_data->>'tgl_masuk', '')::date,
    COALESCE((p_data->>'status_aktif')::boolean, true),
    NULLIF(p_data->>'atasan_id', '')::uuid
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update satu karyawan
CREATE OR REPLACE FUNCTION absen_update_karyawan(p_id uuid, p_data jsonb)
RETURNS jsonb AS $$
BEGIN
  UPDATE absen_karyawan SET
    nama = COALESCE(p_data->>'nama', nama),
    uid_mesin = COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_data->'uid_mesin') x), uid_mesin),
    jabatan = NULLIF(p_data->>'jabatan', ''),
    gaji_bulanan = COALESCE((p_data->>'gaji_bulanan')::numeric, gaji_bulanan),
    tunjangan = COALESCE((p_data->>'tunjangan')::numeric, tunjangan),
    tgl_masuk = CASE WHEN p_data ? 'tgl_masuk' THEN NULLIF(p_data->>'tgl_masuk', '')::date ELSE tgl_masuk END,
    status_aktif = COALESCE((p_data->>'status_aktif')::boolean, status_aktif),
    atasan_id = CASE WHEN p_data ? 'atasan_id' THEN NULLIF(p_data->>'atasan_id', '')::uuid ELSE atasan_id END,
    updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Karyawan tidak ditemukan';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- List karyawan (bypass RLS untuk semua authenticated user)
CREATE OR REPLACE FUNCTION absen_list_karyawan()
RETURNS SETOF absen_karyawan AS $$
  SELECT * FROM absen_karyawan ORDER BY nama;
$$ LANGUAGE sql SECURITY DEFINER;
