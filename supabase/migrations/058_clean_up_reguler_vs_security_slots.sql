-- ============================================================
-- 058: Clean Up Reguler VS Security Slot Categories
--
-- Memastikan seluruh slot Security (Pagi & Malam) terpisah 100%
-- dari slot Reguler Kantor di database.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Update slot Security Shift Pagi
UPDATE absen_jadwal_slot
SET kategori_shift = 'SECURITY_PAGI'
WHERE (label ILIKE '%security%' OR label ILIKE '%patroli%') 
  AND (label NOT ILIKE '%malam%')
  AND (kategori_shift IS NULL OR kategori_shift = 'REGULER' OR kategori_shift = '');

-- 2. Update slot Security Shift Malam
UPDATE absen_jadwal_slot
SET kategori_shift = 'SECURITY_MALAM'
WHERE (label ILIKE '%security%' OR label ILIKE '%patroli%') 
  AND (label ILIKE '%malam%')
  AND (kategori_shift IS NULL OR kategori_shift = 'REGULER' OR kategori_shift = '');

-- 3. Update slot Reguler Kantor sisanya
UPDATE absen_jadwal_slot
SET kategori_shift = 'REGULER'
WHERE (kategori_shift IS NULL OR kategori_shift = '')
  AND label NOT ILIKE '%security%' 
  AND label NOT ILIKE '%patroli%';
