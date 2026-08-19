-- ============================================================
-- 024: Update absen_harian CHECK constraints
--
-- Menambahkan status baru: IZIN_BERBAYAR, IZIN_TIDAK_BERBAYAR, LAPORAN_DITERIMA
-- Menambahkan sumber baru: laporan, izin
--
-- JALANKAN DI SUPABASE SQL EDITOR SETELAH 023
-- ============================================================

-- 1. Drop dan recreate status constraint
ALTER TABLE absen_harian DROP CONSTRAINT IF EXISTS absen_harian_status_check;
ALTER TABLE absen_harian ADD CONSTRAINT absen_harian_status_check
  CHECK (status IN (
    'LENGKAP', 'TANPA_PULANG', 'TANPA_MASUK', 'HANYA_SCAN_TENGAH',
    'TIDAK_ADA_SCAN', 'INSIDEN',
    'IZIN_BERBAYAR', 'IZIN_TIDAK_BERBAYAR', 'LAPORAN_DITERIMA'
  ));

-- 2. Drop dan recreate sumber constraint
ALTER TABLE absen_harian DROP CONSTRAINT IF EXISTS absen_harian_sumber_check;
ALTER TABLE absen_harian ADD CONSTRAINT absen_harian_sumber_check
  CHECK (sumber IN ('sistem', 'koreksi', 'laporan', 'izin'));
