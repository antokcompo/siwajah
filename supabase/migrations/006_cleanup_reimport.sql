-- ============================================================
-- Cleanup: hapus data hasil import yang salah (timezone bug)
-- Jalankan SEBELUM import ulang
-- ============================================================

-- Hapus data harian yang diproses dengan timezone salah
DELETE FROM absen_harian WHERE sumber = 'sistem';

-- Hapus scan mentah
DELETE FROM absen_scan_mentah;

-- Hapus import log
DELETE FROM absen_import_log;

-- Verify cleanup
SELECT 'absen_harian' AS tabel, COUNT(*) AS sisa FROM absen_harian
UNION ALL
SELECT 'absen_scan_mentah', COUNT(*) FROM absen_scan_mentah
UNION ALL
SELECT 'absen_import_log', COUNT(*) FROM absen_import_log;
