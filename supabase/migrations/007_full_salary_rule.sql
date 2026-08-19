-- ============================================================
-- Full Salary Rule:
-- Karyawan yang mempunyai absen masuk (jam_masuk IS NOT NULL)
-- di SEMUA tanggal kerja dalam bulan tersebut mendapat gaji
-- bulanan penuh (gaji_pokok = gaji_bulanan), bukan prorata.
-- ============================================================

-- Add column to track full attendance status
ALTER TABLE absen_gaji_bulanan
  ADD COLUMN IF NOT EXISTS is_gaji_full boolean DEFAULT false;

CREATE OR REPLACE FUNCTION absen_hitung_gaji(p_bulan integer, p_tahun integer)
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
BEGIN
  -- Count work days in month from calendar
  SELECT COUNT(*) INTO v_hari_kerja_bulan
  FROM absen_kalender
  WHERE EXTRACT(MONTH FROM tanggal) = p_bulan
    AND EXTRACT(YEAR FROM tanggal) = p_tahun
    AND jenis_hari = 'kerja';

  IF v_hari_kerja_bulan = 0 THEN
    v_hari_kerja_bulan := 26;
  END IF;

  -- Calculate for each active employee
  FOR v_rec IN
    SELECT
      k.id AS karyawan_id,
      k.gaji_bulanan,
      k.tunjangan,
      COUNT(ah.id) FILTER (WHERE ah.status = 'LENGKAP') AS hari_lengkap,
      COUNT(ah.id) FILTER (WHERE ah.jam_masuk IS NOT NULL) AS hari_masuk,
      COALESCE(SUM(ah.jam_lembur) FILTER (WHERE ah.status_lembur = 'APPROVED'), 0) AS total_lembur
    FROM absen_karyawan k
    LEFT JOIN absen_harian ah ON ah.karyawan_id = k.id
      AND EXTRACT(MONTH FROM ah.tanggal) = p_bulan
      AND EXTRACT(YEAR FROM ah.tanggal) = p_tahun
    WHERE k.status_aktif = true
    GROUP BY k.id, k.gaji_bulanan, k.tunjangan
  LOOP
    v_gaji_harian := v_rec.gaji_bulanan / v_hari_kerja_bulan;
    v_upah_lembur_perjam := v_rec.gaji_bulanan / 173;

    -- Full salary rule: if employee has masuk on ALL work days, full salary
    v_is_full := (v_rec.hari_masuk >= v_hari_kerja_bulan);

    IF v_is_full THEN
      v_gaji_pokok := v_rec.gaji_bulanan;
    ELSE
      v_gaji_pokok := v_rec.hari_lengkap * v_gaji_harian;
    END IF;

    -- Overtime: first hour 1.5x, rest 2.0x
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
      v_rec.hari_masuk,
      v_rec.total_lembur,
      v_gaji_pokok,
      v_gaji_lembur,
      v_rec.tunjangan,
      0,
      v_gaji_pokok + v_gaji_lembur + v_rec.tunjangan,
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

  RETURN jsonb_build_object('success', true, 'jumlah_karyawan', v_total, 'hari_kerja_bulan', v_hari_kerja_bulan);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
