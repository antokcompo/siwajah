-- ============================================================
-- 036: Fix Hari Kerja Count to Distinct Attendance Dates
--
-- Rule:
-- Each distinct date an employee comes to work / has attendance
-- counts as 1 FULL HARI KERJA.
-- Incomplete scans on a day do NOT fractionally reduce the count of working days.
-- Abdul Ghofur attending on Aug 19, 20, 21 = 3 HARI KERJA.
-- ============================================================

CREATE OR REPLACE FUNCTION absen_hitung_gaji(p_bulan integer, p_tahun integer)
RETURNS jsonb AS $$
DECLARE
  v_hari_kerja_bulan integer;
  v_hari_kalender integer;
  v_rec record;
  v_gaji_harian numeric;
  v_upah_lembur_perjam numeric;
  v_gaji_lembur numeric;
  v_gaji_pokok numeric;
  v_is_full boolean;
  v_total integer := 0;
BEGIN
  -- 1. Jumlah hari kerja dari kalender (untuk cek full attendance)
  SELECT COUNT(*) INTO v_hari_kerja_bulan
  FROM absen_kalender
  WHERE EXTRACT(MONTH FROM tanggal) = p_bulan
    AND EXTRACT(YEAR FROM tanggal) = p_tahun
    AND jenis_hari = 'kerja';

  IF v_hari_kerja_bulan = 0 THEN
    v_hari_kerja_bulan := 26;
  END IF;

  -- 2. Jumlah hari kalender bulan ini (untuk pro-rata)
  v_hari_kalender := EXTRACT(DAY FROM
    (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month' - INTERVAL '1 day')
  )::integer;

  FOR v_rec IN
    WITH attended_dates AS (
      -- Distinct dates from face scans
      SELECT sw.karyawan_id, sw.tanggal
      FROM absen_scan_wajah sw
      WHERE EXTRACT(MONTH FROM sw.tanggal) = p_bulan
        AND EXTRACT(YEAR FROM sw.tanggal) = p_tahun

      UNION

      -- Distinct dates from harian attendance
      SELECT ah.karyawan_id, ah.tanggal
      FROM absen_harian ah
      WHERE EXTRACT(MONTH FROM ah.tanggal) = p_bulan
        AND EXTRACT(YEAR FROM ah.tanggal) = p_tahun
        AND (ah.status != 'TIDAK_ADA_SCAN' OR ah.jam_masuk IS NOT NULL OR ah.jam_pulang IS NOT NULL)

      UNION

      -- Distinct dates from approved missing reports
      SELECT lt.karyawan_id, lt.tanggal
      FROM absen_laporan_terlewat lt
      WHERE EXTRACT(MONTH FROM lt.tanggal) = p_bulan
        AND EXTRACT(YEAR FROM lt.tanggal) = p_tahun
        AND lt.status = 'APPROVED'

      UNION

      -- Distinct dates from approved leave
      SELECT ai.karyawan_id, d.tanggal::date AS tanggal
      FROM absen_izin ai
      CROSS JOIN LATERAL generate_series(ai.tanggal_mulai, ai.tanggal_selesai, '1 day'::interval) d
      WHERE ai.status = 'APPROVED'
        AND EXTRACT(MONTH FROM d.tanggal) = p_bulan
        AND EXTRACT(YEAR FROM d.tanggal) = p_tahun

      UNION

      -- Distinct dates from registered overtime
      SELECT dl.karyawan_id, dl.tanggal
      FROM absen_daftar_lembur dl
      WHERE EXTRACT(MONTH FROM dl.tanggal) = p_bulan
        AND EXTRACT(YEAR FROM dl.tanggal) = p_tahun
    ),
    emp_aggregates AS (
      SELECT
        k.id AS karyawan_id,
        k.gaji_bulanan,
        k.tunjangan,
        -- Count distinct attended dates
        COALESCE((
          SELECT COUNT(DISTINCT ad.tanggal)
          FROM attended_dates ad
          WHERE ad.karyawan_id = k.id
        ), 0) AS total_hari_kerja,
        -- Total lembur approved dari absen_harian / absen_daftar_lembur
        COALESCE((
          SELECT SUM(ah.jam_lembur)
          FROM absen_harian ah
          WHERE ah.karyawan_id = k.id
            AND EXTRACT(MONTH FROM ah.tanggal) = p_bulan
            AND EXTRACT(YEAR FROM ah.tanggal) = p_tahun
            AND ah.status_lembur = 'APPROVED'
        ), 0) AS total_lembur
      FROM absen_karyawan k
      WHERE k.status_aktif = true
    )
    SELECT * FROM emp_aggregates
  LOOP
    v_upah_lembur_perjam := v_rec.gaji_bulanan::numeric / v_hari_kerja_bulan / 8;

    -- Full salary: total hari kerja >= v_hari_kerja_bulan → gaji bulanan penuh
    v_is_full := (v_rec.total_hari_kerja >= v_hari_kerja_bulan);

    IF v_is_full THEN
      v_gaji_pokok := v_rec.gaji_bulanan;
    ELSE
      -- Pro-rata: ROUND((gaji_bulanan / hari_kalender) * total_hari_kerja, -2)
      v_gaji_harian := v_rec.gaji_bulanan::numeric / v_hari_kalender;
      v_gaji_pokok := ROUND(v_gaji_harian * v_rec.total_hari_kerja, -2);
    END IF;

    -- Lembur: jam pertama 1.5x, sisanya 2.0x
    IF v_rec.total_lembur > 0 THEN
      IF v_rec.total_lembur <= 1 THEN
        v_gaji_lembur := v_rec.total_lembur * v_upah_lembur_perjam * 1.5;
      ELSE
        v_gaji_lembur := (1 * v_upah_lembur_perjam * 1.5) + ((v_rec.total_lembur - 1) * v_upah_lembur_perjam * 2.0);
      END IF;
    ELSE
      v_gaji_lembur := 0;
    END IF;

    INSERT INTO absen_gaji_bulanan (karyawan_id, bulan, tahun, hari_kerja, jam_lembur_total, gaji_pokok, gaji_lembur, tunjangan, potongan, total_gaji, status, is_gaji_full)
    VALUES (
      v_rec.karyawan_id, p_bulan, p_tahun,
      v_rec.total_hari_kerja,
      v_rec.total_lembur,
      v_gaji_pokok,
      ROUND(v_gaji_lembur, -2),
      v_rec.tunjangan,
      0,
      v_gaji_pokok + ROUND(v_gaji_lembur, -2) + v_rec.tunjangan,
      'draft',
      v_is_full
    )
    ON CONFLICT (karyawan_id, bulan, tahun) DO UPDATE SET
      hari_kerja = EXCLUDED.hari_kerja,
      jam_lembur_total = EXCLUDED.jam_lembur_total,
      gaji_pokok = EXCLUDED.gaji_pokok,
      gaji_lembur = EXCLUDED.gaji_lembur,
      tunjangan = EXCLUDED.tunjangan,
      total_gaji = EXCLUDED.total_gaji,
      is_gaji_full = EXCLUDED.is_gaji_full
    WHERE absen_gaji_bulanan.status = 'draft';

    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
