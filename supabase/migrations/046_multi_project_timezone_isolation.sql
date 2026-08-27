-- ============================================================
-- 046: Per-Project Timezone Resolution in RPC absen_catat_scan_wajah
--
-- Perubahan:
--   - RPC absen_catat_scan_wajah membaca zona_waktu proyek DARI TABEL absen_proyek
--     sesuai kode_proyek karyawan (p_karyawan_id), bukan membaca global konfig.
--   - Memastikan Proyek 524006 (Jayapura/WIT) tetap di WIT dan Proyek 526008 (Mateng/WITA) di WITA.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

CREATE OR REPLACE FUNCTION absen_catat_scan_wajah(
  p_karyawan_id uuid,
  p_slot_id text,
  p_lokasi_kerja text DEFAULT NULL,
  p_jenis_pekerjaan text DEFAULT NULL,
  p_keterangan text DEFAULT NULL,
  p_foto_url text DEFAULT NULL,
  p_gps_lat numeric DEFAULT NULL,
  p_gps_lng numeric DEFAULT NULL,
  p_confidence numeric DEFAULT NULL,
  p_client_tz text DEFAULT NULL,
  p_is_mock_gps boolean DEFAULT false,
  p_gps_accuracy numeric DEFAULT NULL,
  p_fake_gps_score integer DEFAULT 0,
  p_fake_gps_reason text DEFAULT NULL,
  p_waktu_scan timestamptz DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_slot record;
  v_slot_int_id integer;
  v_now timestamptz;
  v_now_time time;
  v_tanggal date;
  v_scan_id uuid;
  v_project_tz text;
  v_check_tz text;
  v_offsite boolean;
  v_final_mock boolean;
  v_deadline_time time;
  v_is_offline boolean;
  v_worker_kode_proyek text;
BEGIN
  -- 1. Get worker's assigned project code
  SELECT COALESCE(kode_proyek, '524006') INTO v_worker_kode_proyek
  FROM absen_karyawan WHERE id = p_karyawan_id;

  -- 2. Resolve project timezone from absen_proyek table for worker's project
  SELECT COALESCE(zona_waktu, 'Asia/Jayapura') INTO v_project_tz
  FROM absen_proyek WHERE kode_proyek = v_worker_kode_proyek;

  IF v_project_tz IS NULL OR TRIM(v_project_tz) = '' THEN
    SELECT COALESCE((SELECT value FROM absen_konfigurasi WHERE key = 'zona_waktu'), 'Asia/Jayapura') INTO v_project_tz;
  END IF;

  v_check_tz := COALESCE(NULLIF(p_client_tz, ''), v_project_tz);
  v_offsite := (v_check_tz IS DISTINCT FROM v_project_tz);
  v_final_mock := COALESCE(p_is_mock_gps, false) OR (COALESCE(p_fake_gps_score, 0) >= 50);

  v_now := COALESCE(p_waktu_scan, now());
  v_now_time := (v_now AT TIME ZONE v_check_tz)::time;
  v_tanggal := (v_now AT TIME ZONE v_check_tz)::date;
  v_is_offline := (p_waktu_scan IS NOT NULL);

  -- Safe Resolution of p_slot_id (Support integer string or "dynamic-pulang-lembur")
  IF p_slot_id ~ '^[0-9]+$' THEN
    v_slot_int_id := p_slot_id::integer;
    SELECT * INTO v_slot FROM absen_jadwal_slot WHERE id = v_slot_int_id AND aktif = true;
  ELSE
    -- Search matching slot for dynamic-pulang-lembur or custom string
    SELECT * INTO v_slot FROM absen_jadwal_slot 
    WHERE (jenis = 'pulang_lembur' OR label ILIKE '%pulang lembur%') AND aktif = true 
    ORDER BY urutan DESC LIMIT 1;

    IF v_slot IS NULL THEN
      SELECT * INTO v_slot FROM absen_jadwal_slot WHERE jenis = 'pulang' AND aktif = true ORDER BY urutan DESC LIMIT 1;
    END IF;

    IF v_slot IS NOT NULL THEN
      v_slot_int_id := v_slot.id;
    END IF;
  END IF;

  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('error', 'Slot tidak ditemukan untuk id: ' || COALESCE(p_slot_id, 'NULL'));
  END IF;

  -- Pengujian Jendela Waktu Absen (Hanya berlaku untuk scan online/realtime)
  IF NOT v_is_offline THEN
    IF v_slot.jenis = 'pulang_lembur' THEN
      -- Untuk Pulang Lembur: Jam Slot + Toleransi adalah BATAS MAKSIMAL AKHIR Absen.
      v_deadline_time := (v_slot.jam + (v_slot.toleransi_menit || ' minutes')::interval)::time;
      IF v_now_time > v_deadline_time AND v_now_time < '17:00:00'::time THEN
        RETURN jsonb_build_object(
          'error', 'Melampaui batas maksimal waktu pulang lembur',
          'jam_slot', v_slot.jam,
          'batas_maksimal', v_deadline_time,
          'waktu_sekarang', v_now_time,
          'timezone', v_check_tz
        );
      END IF;
    ELSE
      -- Untuk Slot Reguler: Jendela Waktu Jam Slot ± Toleransi Menit
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
  END IF;

  IF EXISTS (
    SELECT 1 FROM absen_scan_wajah
    WHERE karyawan_id = p_karyawan_id AND slot_id = v_slot.id AND tanggal = v_tanggal
  ) THEN
    RETURN jsonb_build_object('error', 'Sudah absen untuk slot ini hari ini');
  END IF;

  v_scan_id := gen_random_uuid();
  INSERT INTO absen_scan_wajah (
    id, karyawan_id, slot_id, tanggal, waktu_scan,
    lokasi_kerja, jenis_pekerjaan, keterangan, foto_url,
    gps_lat, gps_lng, confidence, di_luar_lokasi, client_tz,
    is_mock_gps, gps_accuracy, fake_gps_score, fake_gps_reason, kode_proyek
  ) VALUES (
    v_scan_id, p_karyawan_id, v_slot.id, v_tanggal, v_now,
    p_lokasi_kerja, p_jenis_pekerjaan, p_keterangan, p_foto_url,
    p_gps_lat, p_gps_lng, p_confidence, v_offsite, v_check_tz,
    v_final_mock, p_gps_accuracy, COALESCE(p_fake_gps_score, 0), p_fake_gps_reason, v_worker_kode_proyek
  );

  IF v_slot.jenis = 'masuk' THEN
    INSERT INTO absen_harian (karyawan_id, tanggal, jam_masuk, status, sumber, kode_proyek)
    VALUES (p_karyawan_id, v_tanggal, v_now_time, 'TANPA_PULANG', 'face_scan', v_worker_kode_proyek)
    ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET
      jam_masuk = EXCLUDED.jam_masuk,
      status = CASE
        WHEN absen_harian.jam_pulang IS NOT NULL THEN 'LENGKAP'
        ELSE 'TANPA_PULANG'
      END,
      sumber = 'face_scan',
      updated_at = now();

  ELSIF v_slot.jenis IN ('pulang', 'pulang_lembur') THEN
    INSERT INTO absen_harian (karyawan_id, tanggal, jam_pulang, status, sumber, kode_proyek)
    VALUES (p_karyawan_id, v_tanggal, v_now_time, 'TANPA_MASUK', 'face_scan', v_worker_kode_proyek)
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
    'di_luar_lokasi', v_offsite,
    'is_mock_gps', v_final_mock,
    'fake_gps_score', COALESCE(p_fake_gps_score, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
