-- ============================================================
-- 028: Tambah GPS Koordinat & Lokasi pada Laporan Terlewat
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Tambah kolom gps_lat, gps_lng, lokasi_kerja di absen_laporan_terlewat
ALTER TABLE absen_laporan_terlewat ADD COLUMN IF NOT EXISTS gps_lat numeric;
ALTER TABLE absen_laporan_terlewat ADD COLUMN IF NOT EXISTS gps_lng numeric;
ALTER TABLE absen_laporan_terlewat ADD COLUMN IF NOT EXISTS lokasi_kerja text;

-- 2. Update RPC absen_lapor_terlewat untuk menerima GPS
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
BEGIN
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

-- 3. Update RPC absen_proses_laporan agar saat APPROVED memasukkan record ke absen_scan_wajah
CREATE OR REPLACE FUNCTION absen_proses_laporan(
  p_laporan_id uuid,
  p_status text,
  p_catatan text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_lap record;
  v_slot record;
BEGIN
  IF p_status NOT IN ('APPROVED', 'REJECTED') THEN
    RETURN jsonb_build_object('error', 'Status harus APPROVED atau REJECTED');
  END IF;

  SELECT * INTO v_lap FROM absen_laporan_terlewat WHERE id = p_laporan_id;
  IF v_lap IS NULL THEN
    RETURN jsonb_build_object('error', 'Laporan tidak ditemukan');
  END IF;

  IF v_lap.status != 'PENDING' THEN
    RETURN jsonb_build_object('error', 'Laporan sudah diproses');
  END IF;

  UPDATE absen_laporan_terlewat
  SET status = p_status, catatan_admin = p_catatan, approved_by = p_user_id, updated_at = now()
  WHERE id = p_laporan_id;

  IF p_status = 'APPROVED' THEN
    SELECT * INTO v_slot FROM absen_jadwal_slot WHERE id = v_lap.slot_id;

    -- Update status absen_harian
    IF v_slot.jenis = 'masuk' THEN
      INSERT INTO absen_harian (karyawan_id, tanggal, jam_masuk, status, sumber)
      VALUES (v_lap.karyawan_id, v_lap.tanggal, v_slot.jam, 'LAPORAN_DITERIMA', 'laporan')
      ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET
        jam_masuk = COALESCE(absen_harian.jam_masuk, v_slot.jam),
        status = CASE
          WHEN absen_harian.jam_pulang IS NOT NULL THEN 'LENGKAP'
          ELSE 'LAPORAN_DITERIMA'
        END,
        sumber = 'laporan',
        updated_at = now();
    ELSIF v_slot.jenis IN ('pulang', 'pulang_lembur') THEN
      INSERT INTO absen_harian (karyawan_id, tanggal, jam_pulang, status, sumber)
      VALUES (v_lap.karyawan_id, v_lap.tanggal, v_slot.jam, 'LAPORAN_DITERIMA', 'laporan')
      ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET
        jam_pulang = COALESCE(absen_harian.jam_pulang, v_slot.jam),
        status = CASE
          WHEN absen_harian.jam_masuk IS NOT NULL THEN 'LENGKAP'
          ELSE 'LAPORAN_DITERIMA'
        END,
        sumber = 'laporan',
        updated_at = now();
    END IF;

    -- Simpan juga ke tabel absen_scan_wajah agar muncul di list Scan Wajah / Rekap Harian dengan GPS
    INSERT INTO absen_scan_wajah (
      karyawan_id, slot_id, tanggal, waktu_scan,
      lokasi_kerja, keterangan, foto_url, gps_lat, gps_lng
    ) VALUES (
      v_lap.karyawan_id, v_lap.slot_id, v_lap.tanggal, v_lap.updated_at,
      COALESCE(v_lap.lokasi_kerja, 'Laporan Terlewat'),
      'Lapor Terlewat: ' || v_lap.alasan,
      v_lap.foto_url,
      v_lap.gps_lat,
      v_lap.gps_lng
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
