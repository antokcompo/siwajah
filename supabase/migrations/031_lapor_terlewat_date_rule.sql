-- ============================================================
-- 031: Aturan Tanggal Lapor Terlewat (User Same-Day Only, Admin Past Dates Allowed)
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- Update RPC absen_lapor_terlewat: Menolak pengajuan user jika tanggal sudah lewat (CURRENT_DATE)
CREATE OR REPLACE FUNCTION absen_lapor_terlewat(
  p_karyawan_id uuid,
  p_tanggal date,
  p_slot_id integer,
  p_alasan text,
  p_foto_url text DEFAULT NULL,
  p_gps_lat numeric DEFAULT NULL,
  p_gps_lng numeric DEFAULT NULL,
  p_lokasi_kerja text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_id uuid;
  v_today date;
BEGIN
  -- Waktu server dalam WIB/lokal
  v_today := CURRENT_DATE;

  -- User HANYA bisa lapor terlewat pada HARI YANG SAMA (p_tanggal >= v_today)
  IF p_tanggal < v_today THEN
    RETURN jsonb_build_object('error', 'Pengajuan laporan terlewat hanya dapat dilakukan pada hari yang sama. Laporan untuk tanggal yang telah berlalu tidak dapat diajukan.');
  END IF;

  IF p_alasan IS NULL OR length(trim(p_alasan)) < 5 THEN
    RETURN jsonb_build_object('error', 'Alasan harus minimal 5 karakter');
  END IF;

  IF EXISTS (
    SELECT 1 FROM absen_laporan_terlewat
    WHERE karyawan_id = p_karyawan_id AND tanggal = p_tanggal AND slot_id = p_slot_id AND status != 'REJECTED'
  ) THEN
    RETURN jsonb_build_object('error', 'Laporan untuk slot ini sudah pernah diajukan');
  END IF;

  INSERT INTO absen_laporan_terlewat (
    karyawan_id, tanggal, slot_id, alasan, foto_url, gps_lat, gps_lng, lokasi_kerja
  )
  VALUES (
    p_karyawan_id, p_tanggal, p_slot_id, trim(p_alasan), p_foto_url, p_gps_lat, p_gps_lng, p_lokasi_kerja
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
