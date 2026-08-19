-- ============================================================
-- RPC Functions untuk Rekap Harian & data terkait
-- Bypass RLS agar semua authenticated user bisa membaca data
-- ============================================================

-- List absensi harian per bulan (untuk kalender overview)
CREATE OR REPLACE FUNCTION absen_list_harian_bulan(p_start date, p_end date)
RETURNS TABLE (
  tanggal date,
  status text,
  is_insiden boolean
) AS $$
  SELECT tanggal, status, is_insiden
  FROM absen_harian
  WHERE tanggal >= p_start AND tanggal <= p_end;
$$ LANGUAGE sql SECURITY DEFINER;

-- Detail absensi harian per tanggal (dengan nama karyawan)
CREATE OR REPLACE FUNCTION absen_detail_harian(p_tanggal date, p_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  karyawan_id uuid,
  tanggal date,
  jam_masuk time,
  jam_pulang time,
  status text,
  jam_lembur numeric,
  status_lembur text,
  sumber text,
  is_insiden boolean,
  catatan text,
  karyawan_nama text,
  karyawan_jabatan text
) AS $$
  SELECT
    h.id, h.karyawan_id, h.tanggal,
    h.jam_masuk, h.jam_pulang, h.status,
    h.jam_lembur, h.status_lembur, h.sumber,
    h.is_insiden, h.catatan,
    k.nama AS karyawan_nama,
    k.jabatan AS karyawan_jabatan
  FROM absen_harian h
  JOIN absen_karyawan k ON k.id = h.karyawan_id
  WHERE h.tanggal = p_tanggal
    AND (p_status IS NULL OR h.status = p_status)
  ORDER BY k.nama;
$$ LANGUAGE sql SECURITY DEFINER;

-- Ensure absen_user_profiles has a row for the current user
-- Call this on login to auto-create profile if missing
CREATE OR REPLACE FUNCTION absen_ensure_user_profile()
RETURNS jsonb AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_existing record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT * INTO v_existing FROM absen_user_profiles WHERE id = v_uid;

  IF v_existing IS NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

    INSERT INTO absen_user_profiles (id, email, nama, role)
    VALUES (v_uid, v_email, COALESCE(split_part(v_email, '@', 1), 'User'), 'admin')
    ON CONFLICT (id) DO NOTHING;

    RETURN jsonb_build_object('created', true, 'role', 'admin');
  END IF;

  RETURN jsonb_build_object('exists', true, 'role', v_existing.role);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
