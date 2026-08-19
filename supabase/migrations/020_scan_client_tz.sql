-- ============================================================
-- 020: Simpan timezone client pada scan wajah
--
-- Perubahan:
--   - Tambah kolom client_tz pada absen_scan_wajah
--   - Update RPC absen_catat_scan_wajah: simpan p_client_tz ke kolom
--   - Update RPC absen_scan_wajah_harian: return client_tz
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Tambah kolom client_tz
ALTER TABLE absen_scan_wajah ADD COLUMN IF NOT EXISTS client_tz text DEFAULT NULL;

-- 2. Update existing records: set client_tz based on di_luar_lokasi flag
UPDATE absen_scan_wajah
SET client_tz = CASE
  WHEN di_luar_lokasi = false THEN (SELECT value FROM absen_konfigurasi WHERE key = 'zona_waktu')
  ELSE NULL
END
WHERE client_tz IS NULL;

-- 3. Update RPC: catat scan wajah — simpan client_tz
DROP FUNCTION IF EXISTS absen_catat_scan_wajah(uuid, integer, text, text, text, text, numeric, numeric, numeric, text);
CREATE OR REPLACE FUNCTION absen_catat_scan_wajah(
  p_karyawan_id uuid,
  p_slot_id integer,
  p_lokasi_kerja text DEFAULT NULL,
  p_jenis_pekerjaan text DEFAULT NULL,
  p_keterangan text DEFAULT NULL,
  p_foto_url text DEFAULT NULL,
  p_gps_lat numeric DEFAULT NULL,
  p_gps_lng numeric DEFAULT NULL,
  p_confidence numeric DEFAULT NULL,
  p_client_tz text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_slot record;
  v_now timestamptz;
  v_now_time time;
  v_tanggal date;
  v_scan_id uuid;
  v_project_tz text;
  v_check_tz text;
  v_offsite boolean;
BEGIN
  SELECT COALESCE(
    (SELECT value FROM absen_konfigurasi WHERE key = 'zona_waktu'),
    'Asia/Jayapura'
  ) INTO v_project_tz;

  v_check_tz := COALESCE(NULLIF(p_client_tz, ''), v_project_tz);
  v_offsite := (v_check_tz IS DISTINCT FROM v_project_tz);

  v_now := now();
  v_now_time := (v_now AT TIME ZONE v_check_tz)::time;
  v_tanggal := (v_now AT TIME ZONE v_check_tz)::date;

  SELECT * INTO v_slot FROM absen_jadwal_slot WHERE id = p_slot_id AND aktif = true;
  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('error', 'Slot tidak ditemukan');
  END IF;

  IF v_now_time < (v_slot.jam - (v_slot.toleransi_menit || ' minutes')::interval)
     OR v_now_time > (v_slot.jam + (v_slot.toleransi_menit || ' minutes')::interval) THEN
    RETURN jsonb_build_object(
      'error', 'Di luar jendela waktu',
      'jam_slot', v_slot.jam,
      'toleransi', v_slot.toleransi_menit,
      'waktu_sekarang', v_now_time,
      'timezone', v_check_tz
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM absen_scan_wajah
    WHERE karyawan_id = p_karyawan_id AND slot_id = p_slot_id AND tanggal = v_tanggal
  ) THEN
    RETURN jsonb_build_object('error', 'Sudah absen untuk slot ini hari ini');
  END IF;

  v_scan_id := gen_random_uuid();
  INSERT INTO absen_scan_wajah (
    id, karyawan_id, slot_id, tanggal, waktu_scan,
    lokasi_kerja, jenis_pekerjaan, keterangan, foto_url,
    gps_lat, gps_lng, confidence, di_luar_lokasi, client_tz
  ) VALUES (
    v_scan_id, p_karyawan_id, p_slot_id, v_tanggal, v_now,
    p_lokasi_kerja, p_jenis_pekerjaan, p_keterangan, p_foto_url,
    p_gps_lat, p_gps_lng, p_confidence, v_offsite, v_check_tz
  );

  IF v_slot.jenis = 'masuk' THEN
    INSERT INTO absen_harian (karyawan_id, tanggal, jam_masuk, status, sumber)
    VALUES (p_karyawan_id, v_tanggal, v_now_time, 'TANPA_PULANG', 'face_scan')
    ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET
      jam_masuk = EXCLUDED.jam_masuk,
      status = CASE
        WHEN absen_harian.jam_pulang IS NOT NULL THEN 'LENGKAP'
        ELSE 'TANPA_PULANG'
      END,
      sumber = 'face_scan',
      updated_at = now();

  ELSIF v_slot.jenis IN ('pulang', 'pulang_lembur') THEN
    INSERT INTO absen_harian (karyawan_id, tanggal, jam_pulang, status, sumber)
    VALUES (p_karyawan_id, v_tanggal, v_now_time, 'TANPA_MASUK', 'face_scan')
    ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET
      jam_pulang = v_now_time,
      status = CASE
        WHEN absen_harian.jam_masuk IS NOT NULL THEN 'LENGKAP'
        ELSE 'TANPA_MASUK'
      END,
      sumber = 'face_scan',
      updated_at = now();

    IF v_slot.jenis = 'pulang_lembur' THEN
      DECLARE
        v_lembur_mulai time;
        v_lembur_maks numeric;
        v_lembur_pembulatan integer;
        v_jam_lembur numeric;
      BEGIN
        SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'lembur_mulai_hitung'), '19:00') INTO v_lembur_mulai;
        SELECT COALESCE((SELECT value::numeric FROM absen_konfigurasi WHERE key = 'lembur_maks_jam'), 4) INTO v_lembur_maks;
        SELECT COALESCE((SELECT value::integer FROM absen_konfigurasi WHERE key = 'lembur_pembulatan_menit'), 15) INTO v_lembur_pembulatan;

        v_jam_lembur := EXTRACT(EPOCH FROM (v_now_time - v_lembur_mulai)) / 3600.0;
        IF v_jam_lembur < 0 THEN v_jam_lembur := 0; END IF;
        IF v_lembur_pembulatan > 0 THEN
          v_jam_lembur := FLOOR(v_jam_lembur * 60 / v_lembur_pembulatan) * v_lembur_pembulatan / 60.0;
        END IF;
        IF v_jam_lembur > v_lembur_maks THEN v_jam_lembur := v_lembur_maks; END IF;

        IF v_jam_lembur > 0 THEN
          UPDATE absen_harian
          SET jam_lembur = v_jam_lembur, status_lembur = 'PENDING_APPROVAL'
          WHERE karyawan_id = p_karyawan_id AND tanggal = v_tanggal;
        END IF;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'scan_id', v_scan_id,
    'waktu', v_now,
    'tanggal', v_tanggal,
    'slot_label', v_slot.label,
    'di_luar_lokasi', v_offsite
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update RPC: scan wajah harian — return client_tz
DROP FUNCTION IF EXISTS absen_scan_wajah_harian(date);
CREATE OR REPLACE FUNCTION absen_scan_wajah_harian(p_tanggal date)
RETURNS TABLE (
  id uuid,
  karyawan_id uuid,
  karyawan_nama text,
  karyawan_jabatan text,
  atasan_id uuid,
  slot_id integer,
  slot_label text,
  slot_jam time,
  slot_jenis text,
  waktu_scan timestamptz,
  lokasi_kerja text,
  jenis_pekerjaan text,
  keterangan text,
  foto_url text,
  gps_lat numeric,
  gps_lng numeric,
  confidence numeric,
  di_luar_lokasi boolean,
  client_tz text
) AS $$
  SELECT
    sw.id, sw.karyawan_id, k.nama, k.jabatan, k.atasan_id,
    sw.slot_id, js.label, js.jam, js.jenis,
    sw.waktu_scan, sw.lokasi_kerja, sw.jenis_pekerjaan, sw.keterangan,
    sw.foto_url, sw.gps_lat, sw.gps_lng, sw.confidence, sw.di_luar_lokasi,
    sw.client_tz
  FROM absen_scan_wajah sw
  JOIN absen_karyawan k ON k.id = sw.karyawan_id
  LEFT JOIN absen_jadwal_slot js ON js.id = sw.slot_id
  WHERE sw.tanggal = p_tanggal
  ORDER BY k.nama, js.urutan, sw.waktu_scan;
$$ LANGUAGE sql SECURITY DEFINER;
