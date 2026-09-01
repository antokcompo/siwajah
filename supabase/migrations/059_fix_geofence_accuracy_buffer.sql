-- ============================================================
-- 059: Fix Geofence Center Coordinates & Accuracy Buffer
--
-- 1. Menambahkan kolom lat, lng, radius_meter pada absen_proyek jika belum ada.
-- 2. Mengatur titik pusat GPS Portsite Accommodation Complex (524006) ke:
--    Lat: -4.824518, Lng: 136.844673, Radius: 1000 meter.
-- 3. Memperbarui tabel absen_konfigurasi agar selaras dengan Portsite Papua.
-- 4. Memperbarui RPC absen_catat_scan_wajah dengan buffer toleransi akurasi GPS HP.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Tambah kolom lat, lng, radius_meter pada tabel absen_proyek jika belum ada
ALTER TABLE absen_proyek ADD COLUMN IF NOT EXISTS lat numeric DEFAULT -4.824518;
ALTER TABLE absen_proyek ADD COLUMN IF NOT EXISTS lng numeric DEFAULT 136.844673;
ALTER TABLE absen_proyek ADD COLUMN IF NOT EXISTS radius_meter numeric DEFAULT 1000;

-- 2. Set titik pusat koordinat GPS Portsite Accommodation Complex (524006)
UPDATE absen_proyek
SET 
  lat = -4.824518,
  lng = 136.844673,
  radius_meter = 1000
WHERE kode_proyek = '524006' OR lat IS NULL OR lat = -6.2;

-- 3. Update tabel absen_konfigurasi agar titik pusat site proyek selaras
INSERT INTO absen_konfigurasi (kunci, nilai, keterangan, kode_proyek)
VALUES 
  ('site_lat', '-4.824518', 'Latitude Site Portsite Papua', '524006'),
  ('site_lng', '136.844673', 'Longitude Site Portsite Papua', '524006'),
  ('site_radius_meter', '1000', 'Radius Geofence Portsite (meter)', '524006')
ON CONFLICT (kunci) DO UPDATE SET
  nilai = EXCLUDED.nilai;

UPDATE absen_konfigurasi SET nilai = '-4.824518' WHERE kunci = 'site_lat' AND (nilai = '-6.2' OR nilai = '-6.200000');
UPDATE absen_konfigurasi SET nilai = '136.844673' WHERE kunci = 'site_lng' AND (nilai = '106.816666' OR nilai = '106.8167');
UPDATE absen_konfigurasi SET nilai = '1000' WHERE kunci = 'site_radius_meter';

-- 4. Update RPC Catat Scan Wajah dengan Geofencing Pintar & Accuracy Buffer
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
  v_site_radius numeric := 1000;
  v_dist numeric := 0;
  v_effective_dist numeric := 0;
  v_acc_buffer numeric := 0;
  v_di_luar boolean := false;
  v_scan_id uuid;
  v_today date := CURRENT_DATE;
  v_slot_uuid uuid := NULL;
BEGIN
  -- Ambil kode_proyek karyawan
  SELECT kode_proyek INTO v_proyek_kode FROM absen_karyawan WHERE id = p_karyawan_id;
  v_proyek_kode := COALESCE(v_proyek_kode, '524006');

  -- Ambil koordinat & radius site dari tabel absen_proyek
  SELECT COALESCE(lat, -4.824518), COALESCE(lng, 136.844673), COALESCE(radius_meter, 1000)
  INTO v_site_lat, v_site_lng, v_site_radius
  FROM absen_proyek
  WHERE kode_proyek = v_proyek_kode;

  -- Fallback jika proyek belum diset koordinatnya
  v_site_lat := COALESCE(v_site_lat, -4.824518);
  v_site_lng := COALESCE(v_site_lng, 136.844673);
  v_site_radius := COALESCE(v_site_radius, 1000);

  -- Hitung Geofencing jika GPS latitude & longitude valid
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

  -- Insert record scan wajah
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
    'distance_meters', ROUND(v_effective_dist)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
