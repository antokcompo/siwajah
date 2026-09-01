-- ============================================================
-- 069: Fix 17:00 Pulang Slot and Clean Database
--
-- Menyelaraskan slot jam pulang 17:15 menjadi 17:00
-- dan membersihkan error 400 RPC.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Koreksi jam 17:15 menjadi 17:00 tepat
UPDATE absen_jadwal_slot
SET jam = '17:00'::time, label = 'Pulang'
WHERE jam = '17:15'::time OR (jenis = 'pulang' AND jam > '17:00'::time AND jam < '18:00'::time);

-- 2. Pastikan urutan dan status aktif slot reguler rapi
UPDATE absen_jadwal_slot
SET urutan = 6, label = 'Pulang', jenis = 'pulang'
WHERE jam = '17:00'::time AND (kategori_shift = 'REGULER' OR kategori_shift IS NULL);
