-- ============================================================
-- 032: Aturan Absen Hari Libur (Kalender Kerja + Approved Lembur)
--
-- Karyawan tidak bisa absen pada hari libur (minggu, libur_nasional, libur_perusahaan)
-- KECUALI jika didaftarkan lembur & sudah diapprove oleh admin/manajemen.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

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
  v_jenis_hari text;
  v_ket_libur text;
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

  -- 1. Cek apakah karyawan sedang dalam masa izin APPROVED
  IF EXISTS (
    SELECT 1 FROM absen_izin
    WHERE karyawan_id = p_karyawan_id
      AND status = 'APPROVED'
      AND v_tanggal BETWEEN tanggal_mulai AND tanggal_selesai
  ) THEN
    RETURN jsonb_build_object('error', 'Anda sedang dalam masa izin yang telah disetujui untuk hari ini. Silakan ajukan Batal Izin ke Admin jika ingin masuk kerja.');
  END IF;

  -- 2. Cek Kalender Kerja (Hari Libur vs Hari Kerja)
  SELECT jenis_hari, keterangan INTO v_jenis_hari, v_ket_libur
  FROM absen_kalender
  WHERE tanggal = v_tanggal;

  -- Jika tanggal ini adalah hari libur (minggu, libur_nasional, libur_perusahaan)
  IF v_jenis_hari IS NOT NULL AND v_jenis_hari != 'kerja' THEN
    -- Wajib memiliki daftar lembur yang berstatus APPROVED
    IF NOT EXISTS (
      SELECT 1 FROM absen_daftar_lembur
      WHERE karyawan_id = p_karyawan_id
        AND tanggal = v_tanggal
        AND status = 'APPROVED'
    ) THEN
      RETURN jsonb_build_object(
        'error',
        'Hari ini adalah hari libur (' || COALESCE(v_ket_libur, 'Libur') || '). Presensi ditolak karena Anda tidak memiliki daftar lembur yang telah disetujui.'
      );
    END IF;
  END IF;

  -- 3. Ambil data slot jadwal
  SELECT * INTO v_slot FROM absen_jadwal_slot WHERE id = p_slot_id AND aktif = true;
  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('error', 'Slot tidak ditemukan');
  END IF;

  -- 4. Cek pendaftaran lembur untuk slot khusus lembur
  IF v_slot.jenis IN ('lembur', 'pulang_lembur') THEN
    IF NOT EXISTS (
      SELECT 1 FROM absen_daftar_lembur
      WHERE karyawan_id = p_karyawan_id AND tanggal = v_tanggal AND status = 'APPROVED'
    ) THEN
      RETURN jsonb_build_object('error', 'Anda tidak terdaftar lembur hari ini');
    END IF;
  END IF;

  -- 5. Skip time window check for offline sync
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

  -- 6. Cek duplikasi scan
  IF EXISTS (
    SELECT 1 FROM absen_scan_wajah
    WHERE karyawan_id = p_karyawan_id AND slot_id = p_slot_id AND tanggal = v_tanggal
  ) THEN
    RETURN jsonb_build_object('error', 'Sudah absen untuk slot ini hari ini');
  END IF;

  -- 7. Simpan scan wajah
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

  -- 8. Update absen harian
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
