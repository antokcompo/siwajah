-- ============================================================
-- 070: Drop Overloaded RPC Functions & Fix PGRST203 Ambiguity
--
-- Menghapus seluruh duplikasi overload fungsi absen_catat_scan_wajah
-- di database Supabase dan membuat 1 fungsi tunggal yang definitif.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Hapus secara dinamis seluruh overload function absen_catat_scan_wajah lama
DO $$ 
DECLARE 
  r RECORD;
BEGIN
  FOR r IN (
    SELECT proname, oidvectortypes(proargtypes) as argtypes
    FROM pg_proc 
    WHERE proname = 'absen_catat_scan_wajah' AND pronamespace = 'public'::regnamespace
  ) LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.' || quote_ident(r.proname) || '(' || r.argtypes || ') CASCADE;';
  END LOOP;
END $$;

-- 2. Buat 1 fungsi absen_catat_scan_wajah tunggal yang definitif & aman
CREATE OR REPLACE FUNCTION public.absen_catat_scan_wajah(
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
