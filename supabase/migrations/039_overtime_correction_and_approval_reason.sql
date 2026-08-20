-- ============================================================
-- 039: Fitur Koreksi Jam Lembur & Alasan Approval Lembur
--
-- Perubahan:
--   - Update RPC absen_approve_lembur untuk menerima p_jam_lembur (koreksi jam lembur)
--   - Mengizinkan approver mengubah jam lembur disertai catatan/alasan koreksi
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

DROP FUNCTION IF EXISTS absen_approve_lembur(uuid, text, text);
DROP FUNCTION IF EXISTS absen_approve_lembur(uuid, text, text, numeric);

CREATE OR REPLACE FUNCTION absen_approve_lembur(
  p_absensi_id uuid,
  p_status text,
  p_catatan text DEFAULT NULL,
  p_jam_lembur numeric DEFAULT NULL
)
RETURNS jsonb AS $$
BEGIN
  IF p_status NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'Status harus APPROVED atau REJECTED';
  END IF;
  IF p_status = 'REJECTED' AND (p_catatan IS NULL OR trim(p_catatan) = '') THEN
    RAISE EXCEPTION 'Catatan/alasan wajib diisi saat reject';
  END IF;

  UPDATE absen_harian
  SET status_lembur = p_status,
      catatan = COALESCE(NULLIF(trim(p_catatan), ''), catatan),
      jam_lembur = COALESCE(p_jam_lembur, jam_lembur),
      updated_at = now()
  WHERE id = p_absensi_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Data tidak ditemukan atau sudah diproses'; END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
