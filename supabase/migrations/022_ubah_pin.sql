-- ============================================================
-- 022: RPC untuk user ubah PIN sendiri
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

CREATE OR REPLACE FUNCTION absen_ubah_pin(
  p_karyawan_id uuid,
  p_pin_lama text,
  p_pin_baru text
)
RETURNS jsonb AS $$
DECLARE
  v_current_pin text;
BEGIN
  IF length(p_pin_baru) <> 4 OR p_pin_baru !~ '^\d{4}$' THEN
    RETURN jsonb_build_object('error', 'PIN baru harus 4 digit angka');
  END IF;

  SELECT pin INTO v_current_pin
  FROM absen_karyawan
  WHERE id = p_karyawan_id AND status_aktif = true;

  IF v_current_pin IS NULL THEN
    RETURN jsonb_build_object('error', 'Karyawan tidak ditemukan');
  END IF;

  IF v_current_pin <> p_pin_lama THEN
    RETURN jsonb_build_object('error', 'PIN lama salah');
  END IF;

  IF p_pin_lama = p_pin_baru THEN
    RETURN jsonb_build_object('error', 'PIN baru tidak boleh sama dengan PIN lama');
  END IF;

  UPDATE absen_karyawan
  SET pin = p_pin_baru, updated_at = now()
  WHERE id = p_karyawan_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
