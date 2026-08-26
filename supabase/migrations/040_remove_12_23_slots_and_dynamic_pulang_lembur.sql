-- Migration 040: Remove 12:00 & 23:00 slots from absen_jadwal_slot

DELETE FROM absen_jadwal_slot 
WHERE jam IN ('12:00', '12:00:00', '23:00', '23:00:00')
   OR label ILIKE '%12:00%'
   OR label ILIKE '%23:00%';
