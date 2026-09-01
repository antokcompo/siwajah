-- ============================================================
-- 055: Fix User Slot Rules Per Shift & Position
--
-- Memastikan slot jam absen di aplikasi user disaring presisi:
-- 1. Security Shift Malam -> Hanya slot SECURITY_MALAM (17:00, 19:00, 23:00, 01:00, 03:00, 06:00)
-- 2. Security Shift Pagi  -> Hanya slot SECURITY_PAGI (06:00, 08:00, 10:00, 11:30, 13:00, 15:00, 17:00)
-- 3. Karyawan Non-Security -> Hanya slot REGULER (08:00, 10:00, 11:30, 13:00, 15:00, 17:00, 19:00)
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- Function RPC untuk mengambil slot jam absen yang disesuaikan dengan posisi & shift karyawan
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
BEGIN
  -- Ambil data karyawan
  SELECT jabatan, kode_proyek INTO v_jabatan, v_kode_proyek
  FROM absen_karyawan
  WHERE id = p_karyawan_id;

  v_kode_proyek := COALESCE(v_kode_proyek, '524006');

  -- Cek apakah karyawan berjabatan Security / Satpam
  IF (v_jabatan ILIKE '%security%' OR v_jabatan ILIKE '%satpam%' OR v_jabatan ILIKE '%sec%') THEN
    -- Cek roster shift pada tabel absen_roster_security untuk tanggal yang bersangkutan
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
  ORDER BY s.urutan, s.jam;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
