-- ============================================================
-- 026: Daftar Lembur (Overtime Registration)
--
-- Admin mendaftarkan karyawan untuk lembur pada tanggal tertentu.
-- Hanya karyawan terdaftar yang bisa scan absen lembur.
--
-- JALANKAN DI SUPABASE SQL EDITOR SETELAH 025
-- ============================================================

-- 1. Tabel daftar lembur
CREATE TABLE IF NOT EXISTS absen_daftar_lembur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tanggal date NOT NULL,
  karyawan_id uuid NOT NULL REFERENCES absen_karyawan(id),
  catatan text,
  created_by uuid REFERENCES absen_user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daftar_lembur_unique ON absen_daftar_lembur(tanggal, karyawan_id);
CREATE INDEX IF NOT EXISTS idx_daftar_lembur_tanggal ON absen_daftar_lembur(tanggal);

ALTER TABLE absen_daftar_lembur ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daftar_lembur_all" ON absen_daftar_lembur;
CREATE POLICY "daftar_lembur_all" ON absen_daftar_lembur FOR ALL USING (true) WITH CHECK (true);

-- 2. RPC: Batch register employees for overtime
CREATE OR REPLACE FUNCTION absen_daftarkan_lembur(
  p_tanggal date,
  p_karyawan_ids uuid[],
  p_catatan text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_kid uuid;
  v_count integer := 0;
BEGIN
  FOREACH v_kid IN ARRAY p_karyawan_ids
  LOOP
    INSERT INTO absen_daftar_lembur (tanggal, karyawan_id, catatan, created_by)
    VALUES (p_tanggal, v_kid, p_catatan, p_user_id)
    ON CONFLICT (tanggal, karyawan_id) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC: Remove employee from overtime list
CREATE OR REPLACE FUNCTION absen_hapus_daftar_lembur(p_id uuid)
RETURNS jsonb AS $$
BEGIN
  DELETE FROM absen_daftar_lembur WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: Check if employee is registered for overtime today
CREATE OR REPLACE FUNCTION absen_cek_lembur_hari_ini(p_karyawan_id uuid)
RETURNS boolean AS $$
DECLARE
  v_tz text;
  v_today date;
BEGIN
  SELECT COALESCE(
    (SELECT value FROM absen_konfigurasi WHERE key = 'zona_waktu'),
    'Asia/Jayapura'
  ) INTO v_tz;
  v_today := (now() AT TIME ZONE v_tz)::date;

  RETURN EXISTS (
    SELECT 1 FROM absen_daftar_lembur
    WHERE karyawan_id = p_karyawan_id AND tanggal = v_today
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update scan wajah RPC to check lembur registration
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
  p_client_tz text DEFAULT NULL,
  p_waktu_scan timestamptz DEFAULT NULL
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
  v_is_offline boolean;
BEGIN
  SELECT COALESCE(
    (SELECT value FROM absen_konfigurasi WHERE key = 'zona_waktu'),
    'Asia/Jayapura'
  ) INTO v_project_tz;

  v_check_tz := COALESCE(NULLIF(p_client_tz, ''), v_project_tz);
  v_offsite := (v_check_tz IS DISTINCT FROM v_project_tz);

  v_is_offline := (p_waktu_scan IS NOT NULL);
  v_now := COALESCE(p_waktu_scan, now());
  v_now_time := (v_now AT TIME ZONE v_check_tz)::time;
  v_tanggal := (v_now AT TIME ZONE v_check_tz)::date;

  SELECT * INTO v_slot FROM absen_jadwal_slot WHERE id = p_slot_id AND aktif = true;
  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('error', 'Slot tidak ditemukan');
  END IF;

  -- Check lembur registration for lembur/pulang_lembur slots
  IF v_slot.jenis IN ('lembur', 'pulang_lembur') THEN
    IF NOT EXISTS (
      SELECT 1 FROM absen_daftar_lembur
      WHERE karyawan_id = p_karyawan_id AND tanggal = v_tanggal
    ) THEN
      RETURN jsonb_build_object('error', 'Anda tidak terdaftar lembur hari ini');
    END IF;
  END IF;

  -- Skip time window check for offline sync
  IF NOT v_is_offline THEN
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
