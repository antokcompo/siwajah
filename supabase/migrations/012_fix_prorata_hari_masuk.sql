-- ============================================================
-- FIX: Pro-rata gaji dihitung berdasarkan:
--   gaji_bulanan / jumlah_hari_kalender_bulan * hari_masuk
--   dibulatkan ke ratusan terdekat.
--
-- Logika:
-- - Masuk di SEMUA hari kerja → gaji full (gaji_bulanan)
-- - Tidak masuk semua hari kerja → pro-rata:
--   ROUND(gaji_bulanan / hari_kalender * hari_masuk, -2)
--
-- Contoh: gaji 10jt, Juni (30 hari), masuk 13 hari:
--   10.000.000 / 30 * 13 = 4.333.333 → Rp 4.333.300
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- Setelah itu klik "Hitung Gaji" di halaman Rekap Bulanan.
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
  -- Jumlah hari kerja dari kalender (untuk cek full attendance)
  SELECT COUNT(*) INTO v_hari_kerja_bulan
  FROM absen_kalender
  WHERE EXTRACT(MONTH FROM tanggal) = p_bulan
    AND EXTRACT(YEAR FROM tanggal) = p_tahun
    AND jenis_hari = 'kerja';

  IF v_hari_kerja_bulan = 0 THEN
    v_hari_kerja_bulan := 26;
  END IF;

  -- Jumlah hari kalender bulan ini (untuk pro-rata)
  v_hari_kalender := EXTRACT(DAY FROM
    (make_date(p_tahun, p_bulan, 1) + INTERVAL '1 month' - INTERVAL '1 day')
  )::integer;

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
    v_upah_lembur_perjam := v_rec.gaji_bulanan::numeric / v_hari_kerja_bulan / 8;

    -- Full salary: masuk di SEMUA hari kerja → gaji bulanan penuh
    v_is_full := (v_rec.hari_masuk >= v_hari_kerja_bulan);

    IF v_is_full THEN
      v_gaji_pokok := v_rec.gaji_bulanan;
    ELSE
      -- Pro-rata: gaji_bulanan / hari_kalender * hari_masuk, bulatkan ke ratusan
      v_gaji_harian := v_rec.gaji_bulanan::numeric / v_hari_kalender;
      v_gaji_pokok := ROUND(v_gaji_harian * v_rec.hari_masuk, -2);
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
      v_rec.hari_masuk,
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

  RETURN jsonb_build_object('success', true, 'jumlah_karyawan', v_total, 'hari_kerja_bulan', v_hari_kerja_bulan, 'hari_kalender', v_hari_kalender);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
