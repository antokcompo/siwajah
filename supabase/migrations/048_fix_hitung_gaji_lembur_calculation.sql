-- ============================================================
-- 048: Sync & Calculate Approved Overtime in absen_hitung_gaji
--
-- Perubahan:
--   - Menghubungkan absen_daftar_lembur (status = 'APPROVED') dengan absen_harian (jam_lembur).
--   - Menyinkronkan status_lembur = 'APPROVED' pada tabel absen_harian untuk semua lembur yang disetujui.
--   - Menghitung jam_lembur_total & gaji_lembur secara otomatis pada RPC absen_hitung_gaji.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Sync all existing approved overtime registrations into absen_harian
UPDATE absen_harian ah
SET status_lembur = 'APPROVED'
FROM absen_daftar_lembur dl
WHERE ah.karyawan_id = dl.karyawan_id 
  AND ah.tanggal = dl.tanggal 
  AND dl.status = 'APPROVED';

-- 2. Update RPC absen_approve_daftar_lembur to sync status_lembur = 'APPROVED'
CREATE OR REPLACE FUNCTION absen_approve_daftar_lembur(
  p_ids uuid[],
  p_status text,
  p_catatan text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
  v_rec record;
BEGIN
  IF p_status NOT IN ('APPROVED', 'REJECTED') THEN
    RETURN jsonb_build_object('error', 'Status tidak valid');
  END IF;

  FOREACH v_id IN ARRAY p_ids
  LOOP
    SELECT karyawan_id, tanggal INTO v_rec FROM absen_daftar_lembur WHERE id = v_id;
    
    IF v_rec IS NOT NULL THEN
      UPDATE absen_daftar_lembur
      SET status = p_status,
          approved_by = p_user_id,
          approved_at = now(),
          catatan_approval = p_catatan
      WHERE id = v_id;

      IF p_status = 'APPROVED' THEN
        UPDATE absen_harian
        SET status_lembur = 'APPROVED'
        WHERE karyawan_id = v_rec.karyawan_id AND tanggal = v_rec.tanggal;
      END IF;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Update RPC absen_hitung_gaji to calculate approved overtime accurately
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
  -- 1. Sync status_lembur = 'APPROVED' for any approved overtime in p_bulan & p_tahun
  UPDATE absen_harian ah
  SET status_lembur = 'APPROVED'
  FROM absen_daftar_lembur dl
  WHERE ah.karyawan_id = dl.karyawan_id 
    AND ah.tanggal = dl.tanggal 
    AND dl.status = 'APPROVED'
    AND EXTRACT(MONTH FROM dl.tanggal) = p_bulan
    AND EXTRACT(YEAR FROM dl.tanggal) = p_tahun;

  -- 2. Jumlah hari kerja dari kalender kerja bulan ini (sebagai pembagi harian gaji)
  SELECT COUNT(*) INTO v_hari_kerja_bulan
  FROM absen_kalender
  WHERE EXTRACT(MONTH FROM tanggal) = p_bulan
    AND EXTRACT(YEAR FROM tanggal) = p_tahun
    AND jenis_hari = 'kerja';

  IF v_hari_kerja_bulan = 0 THEN
    v_hari_kerja_bulan := 26;
  END IF;

  -- 3. Total slot reguler per hari (default 6)
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
        -- Total lembur approved: From approved harian or approved daftar_lembur with scan
        COALESCE((
          SELECT SUM(
            CASE 
              WHEN ah.jam_lembur IS NOT NULL AND ah.jam_lembur > 0 THEN ah.jam_lembur
              ELSE 4.0 -- Default 4 hours if approved overtime registered and scanned
            END
          )
          FROM absen_daftar_lembur dl
          LEFT JOIN absen_harian ah ON (ah.karyawan_id = dl.karyawan_id AND ah.tanggal = dl.tanggal)
          WHERE dl.karyawan_id = k.id
            AND EXTRACT(MONTH FROM dl.tanggal) = p_bulan
            AND EXTRACT(YEAR FROM dl.tanggal) = p_tahun
            AND dl.status = 'APPROVED'
        ), 0) + 
        COALESCE((
          SELECT SUM(ah.jam_lembur)
          FROM absen_harian ah
          WHERE ah.karyawan_id = k.id
            AND EXTRACT(MONTH FROM ah.tanggal) = p_bulan
            AND EXTRACT(YEAR FROM ah.tanggal) = p_tahun
            AND ah.status_lembur = 'APPROVED'
            AND NOT EXISTS (
              SELECT 1 FROM absen_daftar_lembur dl
              WHERE dl.karyawan_id = ah.karyawan_id AND dl.tanggal = ah.tanggal AND dl.status = 'APPROVED'
            )
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
