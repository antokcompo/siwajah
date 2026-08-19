-- ============================================================
-- 025: Update absen_scan_hari_ini to include approved laporan
--
-- Setelah admin approve laporan terlewat, slot tersebut harus
-- muncul sebagai "done" di Beranda user.
--
-- JALANKAN DI SUPABASE SQL EDITOR SETELAH 024
-- ============================================================

CREATE OR REPLACE FUNCTION absen_scan_hari_ini(p_karyawan_id uuid)
RETURNS TABLE (
  slot_id integer,
  waktu_scan timestamptz,
  lokasi_kerja text,
  jenis_pekerjaan text
) AS $$
DECLARE
  v_tz text;
  v_today date;
BEGIN
  SELECT COALESCE(
    (SELECT value FROM absen_konfigurasi WHERE key = 'zona_waktu'),
    'Asia/Jayapura'
  ) INTO v_tz;
  v_today := (now() AT TIME ZONE v_tz)::date;

  RETURN QUERY
  -- Actual face scans
  SELECT sw.slot_id, sw.waktu_scan, sw.lokasi_kerja, sw.jenis_pekerjaan
  FROM absen_scan_wajah sw
  WHERE sw.karyawan_id = p_karyawan_id AND sw.tanggal = v_today

  UNION ALL

  -- Approved laporan terlewat (treated as completed slots)
  SELECT lt.slot_id, lt.updated_at AS waktu_scan, NULL::text AS lokasi_kerja, NULL::text AS jenis_pekerjaan
  FROM absen_laporan_terlewat lt
  WHERE lt.karyawan_id = p_karyawan_id AND lt.tanggal = v_today AND lt.status = 'APPROVED';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
