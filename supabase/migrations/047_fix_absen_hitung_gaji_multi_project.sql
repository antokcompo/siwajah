-- ============================================================
-- 047: Multi-Project Support & RLS Fix for absen_hitung_gaji RPC
--
-- Perubahan:
--   - RPC absen_hitung_gaji mendukung p_kode_proyek text DEFAULT NULL.
--   - Menjamin RLS Policy pada absen_gaji_bulanan dan absen_periode_gaji terbuka untuk Select & Write.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- Fix RLS Policies for absen_gaji_bulanan & absen_periode_gaji
ALTER TABLE absen_gaji_bulanan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gaji_select" ON absen_gaji_bulanan;
DROP POLICY IF EXISTS "gaji_all" ON absen_gaji_bulanan;
CREATE POLICY "gaji_select_all" ON absen_gaji_bulanan FOR SELECT USING (true);
CREATE POLICY "gaji_write_all" ON absen_gaji_bulanan FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE absen_periode_gaji ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "periode_select" ON absen_periode_gaji;
DROP POLICY IF EXISTS "periode_all" ON absen_periode_gaji;
CREATE POLICY "periode_select_all" ON absen_periode_gaji FOR SELECT USING (true);
CREATE POLICY "periode_write_all" ON absen_periode_gaji FOR ALL USING (true) WITH CHECK (true);


DROP FUNCTION IF EXISTS absen_hitung_gaji(integer, integer);
DROP FUNCTION IF EXISTS absen_hitung_gaji(integer, integer, text);

CREATE OR REPLACE FUNCTION absen_hitung_gaji(
  p_bulan integer,
  p_tahun integer,
  p_kode_proyek text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_hari_kerja_bulan integer;
  v_rec record;
  v_gaji_harian numeric;
  v_upah_lembur_perjam numeric;
  v_gaji_lembur numeric;
  v_gaji_pokok numeric;
  v_is_full boolean;
  v_total integer := 0;
  v_slot_reguler_count numeric := 6;
BEGIN
  -- 1. Jumlah hari kerja dari kalender kerja bulan ini (sebagai pembagi harian gaji)
  SELECT COUNT(*) INTO v_hari_kerja_bulan
  FROM absen_kalender
  WHERE EXTRACT(MONTH FROM tanggal) = p_bulan
    AND EXTRACT(YEAR FROM tanggal) = p_tahun
    AND jenis_hari = 'kerja';

  IF v_hari_kerja_bulan = 0 THEN
    v_hari_kerja_bulan := 26;
  END IF;

  -- 2. Total slot reguler per hari (default 6)
  SELECT COALESCE(NULLIF(COUNT(*), 0), 6) INTO v_slot_reguler_count
  FROM absen_jadwal_slot
  WHERE (jenis != 'LEMBUR' OR jenis IS NULL) AND (aktif = true OR aktif IS NULL);

  IF v_slot_reguler_count = 0 THEN
    v_slot_reguler_count := 6;
  END IF;

  FOR v_rec IN
    WITH daily_slot_counts AS (
      -- Face scans
      SELECT sw.karyawan_id, sw.tanggal, sw.slot_id
      FROM absen_scan_wajah sw
      JOIN absen_jadwal_slot js ON js.id = sw.slot_id
      WHERE EXTRACT(MONTH FROM sw.tanggal) = p_bulan
        AND EXTRACT(YEAR FROM sw.tanggal) = p_tahun
        AND (js.jenis != 'LEMBUR' OR js.jenis IS NULL)

      UNION

      -- Approved missing reports
      SELECT lt.karyawan_id, lt.tanggal, lt.slot_id
      FROM absen_laporan_terlewat lt
      JOIN absen_jadwal_slot js ON js.id = lt.slot_id
      WHERE EXTRACT(MONTH FROM lt.tanggal) = p_bulan
        AND EXTRACT(YEAR FROM lt.tanggal) = p_tahun
        AND lt.status = 'APPROVED'
        AND (js.jenis != 'LEMBUR' OR js.jenis IS NULL)
    ),
    daily_fractions AS (
      -- Slot weight per date: MIN(1.0, verified_slots / 6)
      SELECT
        k.id AS karyawan_id,
        d.tanggal,
        LEAST(1.0, COUNT(DISTINCT d.slot_id)::numeric / v_slot_reguler_count) AS bobot_harian
      FROM absen_karyawan k
      JOIN daily_slot_counts d ON d.karyawan_id = k.id
      WHERE k.status_aktif = true
        AND (p_kode_proyek IS NULL OR k.kode_proyek = p_kode_proyek)
      GROUP BY k.id, d.tanggal
    ),
    attended_dates AS (
      SELECT sw.karyawan_id, sw.tanggal FROM absen_scan_wajah sw
      WHERE EXTRACT(MONTH FROM sw.tanggal) = p_bulan AND EXTRACT(YEAR FROM sw.tanggal) = p_tahun
      UNION
      SELECT ah.karyawan_id, ah.tanggal FROM absen_harian ah
      WHERE EXTRACT(MONTH FROM ah.tanggal) = p_bulan AND EXTRACT(YEAR FROM ah.tanggal) = p_tahun
        AND (ah.status != 'TIDAK_ADA_SCAN' OR ah.jam_masuk IS NOT NULL OR ah.jam_pulang IS NOT NULL)
      UNION
      SELECT lt.karyawan_id, lt.tanggal FROM absen_laporan_terlewat lt
      WHERE EXTRACT(MONTH FROM lt.tanggal) = p_bulan AND EXTRACT(YEAR FROM lt.tanggal) = p_tahun AND lt.status = 'APPROVED'
      UNION
      SELECT ai.karyawan_id, d.tanggal::date AS tanggal FROM absen_izin ai
      CROSS JOIN LATERAL generate_series(ai.tanggal_mulai, ai.tanggal_selesai, '1 day'::interval) d
      WHERE ai.status = 'APPROVED' AND EXTRACT(MONTH FROM d.tanggal) = p_bulan AND EXTRACT(YEAR FROM d.tanggal) = p_tahun
      UNION
      SELECT dl.karyawan_id, dl.tanggal FROM absen_daftar_lembur dl
      WHERE EXTRACT(MONTH FROM dl.tanggal) = p_bulan AND EXTRACT(YEAR FROM dl.tanggal) = p_tahun
    ),
    emp_aggregates AS (
      SELECT
        k.id AS karyawan_id,
        k.gaji_bulanan,
        k.tunjangan,
        -- HARI KERJA = Distinct calendar dates count
        COALESCE((
          SELECT COUNT(DISTINCT ad.tanggal)
          FROM attended_dates ad
          WHERE ad.karyawan_id = k.id
        ), 0) AS total_hari_kerja,
        -- SUM of daily slot fractions (e.g. 3/6 + 4/6 + 1/6 = 8/6)
        COALESCE((
          SELECT SUM(df.bobot_harian)
          FROM daily_fractions df
          WHERE df.karyawan_id = k.id
        ), 0) AS total_bobot_slot,
        -- Total lembur approved
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
        AND (p_kode_proyek IS NULL OR k.kode_proyek = p_kode_proyek)
    )
    SELECT * FROM emp_aggregates
  LOOP
    v_upah_lembur_perjam := v_rec.gaji_bulanan::numeric / v_hari_kerja_bulan / 8;

    -- Full salary: total bobot slot >= v_hari_kerja_bulan → gaji bulanan penuh (100% Master Salary)
    v_is_full := (v_rec.total_bobot_slot >= v_hari_kerja_bulan);

    IF v_is_full THEN
      v_gaji_pokok := v_rec.gaji_bulanan;
    ELSE
      -- Pro-rata: ROUND((gaji_bulanan / hari_kerja_kalender) * total_bobot_slot, -2)
      v_gaji_harian := v_rec.gaji_bulanan::numeric / v_hari_kerja_bulan;
      v_gaji_pokok := ROUND(v_gaji_harian * v_rec.total_bobot_slot, -2);
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
