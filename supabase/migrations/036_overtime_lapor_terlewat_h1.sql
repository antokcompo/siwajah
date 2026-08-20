-- ============================================================
-- 036: Aturan Lapor Terlewat Lembur Maksimal H+1
--
-- Aturan Tanggal Lapor Terlewat:
-- 1. Slot Reguler: Hanya dapat diajukan pada hari yang sama (H)
-- 2. Slot Lembur: Dapat diajukan maksimal H+1 dari jadwal lembur yang terlewat (H & H+1)
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

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
  v_is_lembur boolean := false;
BEGIN
  v_today := CURRENT_DATE;

  -- Cek apakah slot yang diajukan adalah slot lembur
  SELECT (COALESCE(jenis, '') IN ('LEMBUR', 'lembur', 'pulang_lembur') OR COALESCE(label, '') ILIKE '%lembur%') INTO v_is_lembur
  FROM absen_jadwal_slot
  WHERE id = p_slot_id;

  -- Aturan Batas Tanggal:
  -- - Slot Lembur: Boleh diajukan maksimal H+1 (p_tanggal >= v_today - 1)
  -- - Slot Reguler: Boleh diajukan pada hari yang sama (p_tanggal >= v_today)
  IF v_is_lembur THEN
    IF p_tanggal < (v_today - INTERVAL '1 day')::date THEN
      RETURN jsonb_build_object('error', 'Pengajuan laporan terlewat untuk lembur maksimal H+1 dari jadwal lembur yang terlewat.');
    END IF;
  ELSE
    IF p_tanggal < v_today THEN
      RETURN jsonb_build_object('error', 'Pengajuan laporan terlewat reguler hanya dapat dilakukan pada hari yang sama.');
    END IF;
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
