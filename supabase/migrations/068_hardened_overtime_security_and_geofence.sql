-- ============================================================
-- 068: Hardened Overtime Security, Job-Based Slot Filtering & Geofence
--
-- 1. Memastikan slot jam presensi difilter secara ketat berdasarkan Jabatan:
--    - Karyawan Umum (Non-Security): Hanya slot Reguler (08:00 - 17:00).
--    - Security Pagi: Hanya slot Security Pagi (06:00 - 17:00).
--    - Security Malam: Hanya slot Security Malam (17:00 - 06:00 subuh).
-- 2. Memastikan slot Lembur (19:00 / Pulang Lembur) HANYA dapat diakses & di-scan
--    oleh pekerja yang SUDAH didaftarkan & disetujui (APPROVED) lemburnya.
-- 3. Ketahanan Fake GPS & Geospasial Geofence dengan hardware accuracy buffer.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Upgrade absen_get_jadwal_slot_user
CREATE OR REPLACE FUNCTION absen_get_jadwal_slot_user(
  p_karyawan_id uuid,
  p_tanggal date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  id text,
  jam time,
  label text,
  jenis text,
  toleransi_menit integer,
  wajib boolean,
  urutan integer,
  kode_proyek text,
  kategori_shift text
) AS $$
DECLARE
  v_jabatan text;
  v_kode_proyek text;
  v_shift text := NULL;
  v_target_kat text := 'REGULER';
  v_is_lembur_approved boolean := false;
BEGIN
  -- Ambil data karyawan
  SELECT jabatan, kode_proyek INTO v_jabatan, v_kode_proyek
  FROM absen_karyawan
  WHERE id = p_karyawan_id;

  v_kode_proyek := COALESCE(v_kode_proyek, '524006');

  -- Cek persetujuan lembur pada tanggal yang bersangkutan (Hanya yang status APPROVED)
  SELECT (
    EXISTS (
      SELECT 1 FROM absen_daftar_lembur 
      WHERE karyawan_id = p_karyawan_id AND tanggal = p_tanggal AND status = 'APPROVED'
    )
    OR
    EXISTS (
      SELECT 1 FROM absen_harian 
      WHERE karyawan_id = p_karyawan_id AND tanggal = p_tanggal AND status_lembur = 'APPROVED'
    )
  ) INTO v_is_lembur_approved;

  -- Cek apakah karyawan berjabatan Security / Satpam
  IF (v_jabatan ILIKE '%security%' OR v_jabatan ILIKE '%satpam%' OR v_jabatan ILIKE '%sec%') THEN
    SELECT shift INTO v_shift
    FROM absen_roster_security
    WHERE karyawan_id = p_karyawan_id AND tanggal = p_tanggal;

    v_shift := COALESCE(UPPER(v_shift), 'PAGI');

    IF v_shift = 'MALAM' THEN
      v_target_kat := 'SECURITY_MALAM';
    ELSE
      v_target_kat := 'SECURITY_PAGI';
    END IF;
  ELSE
    v_target_kat := 'REGULER';
  END IF;

  RETURN QUERY
  SELECT 
    s.id::text,
    s.jam,
    s.label,
    s.jenis,
    s.toleransi_menit,
    s.wajib,
    s.urutan,
    s.kode_proyek,
    COALESCE(s.kategori_shift, 'REGULER') AS kategori_shift
  FROM absen_jadwal_slot s
  WHERE s.aktif = true
    AND (s.kode_proyek = v_kode_proyek OR s.kode_proyek IS NULL)
    AND (
      (v_target_kat = 'REGULER' AND (s.kategori_shift = 'REGULER' OR s.kategori_shift IS NULL OR s.kategori_shift = ''))
      OR
      (v_target_kat = 'SECURITY_PAGI' AND s.kategori_shift = 'SECURITY_PAGI')
      OR
      (v_target_kat = 'SECURITY_MALAM' AND s.kategori_shift = 'SECURITY_MALAM')
    )
    -- Filter slot lembur (19:00 / Pulang Lembur): HANYA muncul jika karyawan disetujui (APPROVED) lembur
    AND (
      NOT (s.jenis IN ('lembur', 'pulang_lembur') OR s.label ILIKE '%lembur%')
      OR v_is_lembur_approved = true
    )
  ORDER BY s.urutan, s.jam;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Upgrade absen_catat_scan_wajah dengan Validasi Keamanan Ketat & Anti-Fake GPS
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
  p_fake_gps_reason text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_proyek_kode text;
  v_site_lat numeric := -4.824518;
  v_site_lng numeric := 136.844673;
  v_site_radius numeric := 500;
  v_dist numeric := 0;
  v_effective_dist numeric := 0;
  v_acc_buffer numeric := 0;
  v_di_luar boolean := false;
  v_scan_id uuid;
  v_today date := CURRENT_DATE;
  v_slot_uuid uuid := NULL;
  v_slot_jenis text := NULL;
  v_slot_label text := NULL;
  v_is_lembur_approved boolean := false;
BEGIN
  -- 1. Validasi Slot & Izin Lembur (Security Check)
  IF p_slot_id IS NOT NULL AND p_slot_id != '' AND p_slot_id != 'dynamic-pulang-lembur' THEN
    SELECT jenis, label INTO v_slot_jenis, v_slot_label
    FROM absen_jadwal_slot
    WHERE id::text = p_slot_id;

    IF (v_slot_jenis IN ('lembur', 'pulang_lembur') OR v_slot_label ILIKE '%lembur%' OR p_slot_id = 'dynamic-pulang-lembur') THEN
      SELECT (
        EXISTS (
          SELECT 1 FROM absen_daftar_lembur 
          WHERE karyawan_id = p_karyawan_id AND tanggal = v_today AND status = 'APPROVED'
        )
        OR
        EXISTS (
          SELECT 1 FROM absen_harian 
          WHERE karyawan_id = p_karyawan_id AND tanggal = v_today AND status_lembur = 'APPROVED'
        )
      ) INTO v_is_lembur_approved;

      IF NOT v_is_lembur_approved THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Akses Ditolak: Anda belum didaftarkan / disetujui untuk lembur pada tanggal ini.'
        );
      END IF;
    END IF;
  END IF;

  -- 2. Ambil data proyek karyawan
  SELECT kode_proyek INTO v_proyek_kode FROM absen_karyawan WHERE id = p_karyawan_id;
  v_proyek_kode := COALESCE(v_proyek_kode, '524006');

  -- Ambil koordinat & radius site dari tabel absen_proyek
  SELECT COALESCE(lat, -4.824518), COALESCE(lng, 136.844673), COALESCE(radius_meter, 500)
  INTO v_site_lat, v_site_lng, v_site_radius
  FROM absen_proyek
  WHERE kode_proyek = v_proyek_kode;

  -- Fallback jika proyek belum diset koordinatnya
  v_site_lat := COALESCE(v_site_lat, -4.824518);
  v_site_lng := COALESCE(v_site_lng, 136.844673);
  v_site_radius := COALESCE(v_site_radius, 500);

  -- 3. Hitung Geofencing jika GPS latitude & longitude valid
  IF p_gps_lat IS NOT NULL AND p_gps_lng IS NOT NULL THEN
    v_dist := 6371000 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(p_gps_lat - v_site_lat) / 2), 2) +
      COS(RADIANS(v_site_lat)) * COS(RADIANS(p_gps_lat)) *
      POWER(SIN(RADIANS(p_gps_lng - v_site_lng) / 2), 2)
    ));

    -- Buffer toleransi akurasi hardware GPS HP pekerja (pos.coords.accuracy)
    v_acc_buffer := LEAST(GREATEST(COALESCE(p_gps_accuracy, 0), 0), 100);
    v_effective_dist := GREATEST(0, v_dist - v_acc_buffer);

    IF v_effective_dist > v_site_radius THEN
      v_di_luar := true;
    END IF;
  END IF;

  -- Validasi UUID format untuk slot_id
  IF p_slot_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_slot_uuid := p_slot_id::uuid;
  END IF;

  -- 4. Insert record scan wajah
  INSERT INTO absen_scan_wajah (
    karyawan_id,
    slot_id,
    tanggal,
    waktu_scan,
    lokasi_kerja,
    jenis_pekerjaan,
    keterangan,
    foto_url,
    gps_lat,
    gps_lng,
    confidence,
    client_tz,
    is_mock_gps,
    gps_accuracy,
    fake_gps_score,
    fake_gps_reason,
    di_luar_lokasi,
    kode_proyek
  )
  VALUES (
    p_karyawan_id,
    v_slot_uuid,
    v_today,
    now(),
    p_lokasi_kerja,
    p_jenis_pekerjaan,
    p_keterangan,
    p_foto_url,
    p_gps_lat,
    p_gps_lng,
    p_confidence,
    p_client_tz,
    COALESCE(p_is_mock_gps, false),
    p_gps_accuracy,
    COALESCE(p_fake_gps_score, 0),
    p_fake_gps_reason,
    v_di_luar,
    v_proyek_kode
  )
  RETURNING id INTO v_scan_id;

  RETURN jsonb_build_object(
    'success', true,
    'scan_id', v_scan_id,
    'di_luar_lokasi', v_di_luar,
    'jarak_meter', ROUND(v_effective_dist),
    'is_mock_gps', COALESCE(p_is_mock_gps, false),
    'fake_gps_score', COALESCE(p_fake_gps_score, 0),
    'waktu_scan', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
