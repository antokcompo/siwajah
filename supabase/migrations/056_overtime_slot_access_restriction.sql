-- ============================================================
-- 056: Overtime Slot Access Restriction (Max 17:00 Normal, 19:00 Overtime Only)
--
-- Memastikan slot jam absen reguler hanya sampai jam 17:00.
-- Slot jam 19:00 (Lembur) HANYA dapat diakses/ditampilkan bagi
-- pekerja yang sudah didaftarkan & disetujui lembur pada tanggal tsb.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

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

  -- Cek persetujuan lembur pada tanggal yang bersangkutan
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
    -- Filter slot lembur (misal 19:00): Hanya muncul jika karyawan disetujui lembur
    AND (
      NOT (s.jenis IN ('lembur', 'pulang_lembur') OR s.label ILIKE '%lembur%')
      OR v_is_lembur_approved = true
    )
  ORDER BY s.urutan, s.jam;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
