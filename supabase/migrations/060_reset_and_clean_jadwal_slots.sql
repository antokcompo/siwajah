-- ============================================================
-- 060: Safe Clean Up & Categorization of Jadwal Slots
--
-- Mengelompokkan slot jam absen secara presisi tanpa menghapus data
-- agar tidak memicu error foreign key constraint:
-- 1. Reguler Kantor (REGULER)
-- 2. Security Shift Pagi (SECURITY_PAGI)
-- 3. Security Shift Malam (SECURITY_MALAM)
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

DO $$
BEGIN
  -- 1. Set default kategori_shift = 'REGULER' untuk slot lama yang null/kosong
  UPDATE absen_jadwal_slot 
  SET kategori_shift = 'REGULER' 
  WHERE kategori_shift IS NULL OR kategori_shift = '';

  -- 2. Tag slot SECURITY SHIFT PAGI (06:00, 08:00, 10:00, 11:30, 13:00, 15:00, 17:00 dengan label Security)
  UPDATE absen_jadwal_slot
  SET kategori_shift = 'SECURITY_PAGI'
  WHERE (label ILIKE '%security%' OR label ILIKE '%patroli%')
    AND label NOT ILIKE '%malam%'
    AND label NOT ILIKE '%subuh%';

  -- 3. Tag slot SECURITY SHIFT MALAM (17:00, 19:00, 23:00, 01:00, 03:00, 06:00 dengan label Security Malam/Subuh)
  UPDATE absen_jadwal_slot
  SET kategori_shift = 'SECURITY_MALAM'
  WHERE (label ILIKE '%security%' OR label ILIKE '%patroli%')
    AND (label ILIKE '%malam%' OR label ILIKE '%subuh%' OR jam IN ('01:00'::time, '03:00'::time, '23:00'::time));

  -- 4. Tag slot 01:00 dan 03:00 khusus ke SECURITY_MALAM
  UPDATE absen_jadwal_slot
  SET kategori_shift = 'SECURITY_MALAM'
  WHERE jam IN ('01:00'::time, '03:00'::time);

  -- 5. Tag slot 06:00 khusus ke SECURITY_PAGI (Masuk Pagi) atau SECURITY_MALAM (Pulang Malam)
  UPDATE absen_jadwal_slot
  SET kategori_shift = 'SECURITY_PAGI'
  WHERE jam = '06:00'::time AND (label ILIKE '%masuk pagi%' OR label ILIKE '%pagi%');

  UPDATE absen_jadwal_slot
  SET kategori_shift = 'SECURITY_MALAM'
  WHERE jam = '06:00'::time AND (label ILIKE '%pulang malam%' OR label ILIKE '%malam%');

  -- 6. Tag slot REGULER KANTOR untuk selain slot Security
  UPDATE absen_jadwal_slot
  SET kategori_shift = 'REGULER'
  WHERE label NOT ILIKE '%security%' 
    AND label NOT ILIKE '%patroli%' 
    AND label NOT ILIKE '%subuh%'
    AND jam NOT IN ('01:00'::time, '03:00'::time);

END $$;
