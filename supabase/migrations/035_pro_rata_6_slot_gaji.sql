-- ============================================================
-- 035: Aturan Gaji Pro-Rata 6 Slot Presensi per Hari
--
-- 1. Presensi normal sebulan dihitung dari 6 slot reguler harian.
-- 2. Kehadiran per hari dihitung berdasarkan rasio slot valid:
--    - 6 slot disetujui/scan = 6/6 (100% = 1.00 hari)
--    - 5 slot disetujui/scan = 5/6 (83.33% = 0.83 hari)
--    - 4 slot disetujui/scan = 4/6 (66.67% = 0.67 hari)
--    - 3 slot disetujui/scan = 3/6 (50.00% = 0.50 hari)
-- 3. Slot berstatus 'PENDING' (menunggu approval admin) BELUM dihitung
--    sampai disetujui (APPROVED) oleh Admin.
-- 4. Gaji Pokok Pro-Rata = ROUND((Gaji Master / Total Hari Kalender) * Total Hari Kerja Efektif, -2)
--
-- JALANKAN DI SUPABASE SQL EDITOR
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
  v_slot_reguler_count numeric := 6;
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
    (make_date(p_tahun, p_tahun, 1) + INTERVAL '1 month' - INTERVAL '1 day')
  )::integer;

  -- Ambil jumlah hari kalender yang tepat
  v_hari_kalender := EXTRACT(DAY FROM
    (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month' - INTERVAL '1 day')
  )::integer;

  -- 3. Hitung jumlah slot reguler aktif (default 6)
  SELECT COALESCE(NULLIF(COUNT(*), 0), 6) INTO v_slot_reguler_count
  FROM absen_jadwal_slot
  WHERE (jenis != 'LEMBUR' OR jenis IS NULL) AND (aktif = true OR aktif IS NULL);

  IF v_slot_reguler_count = 0 THEN
    v_slot_reguler_count := 6;
  END IF;

  FOR v_rec IN
    WITH daily_slot_counts AS (
      -- Ambil semua slot presensi valid (face scan reguler)
      SELECT sw.karyawan_id, sw.tanggal, sw.slot_id
      FROM absen_scan_wajah sw
      JOIN absen_jadwal_slot js ON js.id = sw.slot_id
      WHERE EXTRACT(MONTH FROM sw.tanggal) = p_bulan
        AND EXTRACT(YEAR FROM sw.tanggal) = p_tahun
        AND (js.jenis != 'LEMBUR' OR js.jenis IS NULL)

      UNION

      -- Ambil semua slot presensi valid dari Laporan Terlewat yang DISERETUJUI ADMIN (status = 'APPROVED')
      SELECT lt.karyawan_id, lt.tanggal, lt.slot_id
      FROM absen_laporan_terlewat lt
      JOIN absen_jadwal_slot js ON js.id = lt.slot_id
      WHERE EXTRACT(MONTH FROM lt.tanggal) = p_bulan
        AND EXTRACT(YEAR FROM lt.tanggal) = p_tahun
        AND lt.status = 'APPROVED'
        AND (js.jenis != 'LEMBUR' OR js.jenis IS NULL)
    ),
    daily_fractions AS (
      -- Hitung bobot kehadiran harian per tanggal: (slot disetujui / total slot reguler 6)
      SELECT
        k.id AS karyawan_id,
        d.tanggal,
        LEAST(1.0, COUNT(DISTINCT d.slot_id)::numeric / v_slot_reguler_count) AS bobot_harian
      FROM absen_karyawan k
      JOIN daily_slot_counts d ON d.karyawan_id = k.id
      GROUP BY k.id, d.tanggal
    ),
    emp_aggregates AS (
      SELECT
        k.id AS karyawan_id,
        k.gaji_bulanan,
        k.tunjangan,
        -- Total hari kerja efektif (penjumlahan bobot harian 6 slot)
        COALESCE((
          SELECT SUM(df.bobot_harian)
          FROM daily_fractions df
          WHERE df.karyawan_id = k.id
        ), 0) AS hari_kerja_efektif,
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

    -- Full salary: total hari kerja efektif >= v_hari_kerja_bulan → gaji bulanan penuh
    v_is_full := (v_rec.hari_kerja_efektif >= v_hari_kerja_bulan);

    IF v_is_full THEN
      v_gaji_pokok := v_rec.gaji_bulanan;
    ELSE
      -- Pro-rata 6 slot: ROUND((gaji_bulanan / hari_kalender) * hari_kerja_efektif, -2)
      v_gaji_harian := v_rec.gaji_bulanan::numeric / v_hari_kalender;
      v_gaji_pokok := ROUND(v_gaji_harian * v_rec.hari_kerja_efektif, -2);
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
      ROUND(v_rec.hari_kerja_efektif, 2),
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
      status = 'draft',
      is_gaji_full = EXCLUDED.is_gaji_full,
      updated_at = now();

    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'total_karyawan', v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
