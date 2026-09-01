-- ============================================================
-- 067: Clear All Active Jadwal Slots for Fresh Manual Setup
--
-- Menonaktifkan & membersihkan seluruh slot jam absen lama
-- sehingga halaman Jadwal Slot Absen bersih total (kosong)
-- dan siap diinput manual oleh Admin.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Nonaktifkan seluruh slot lama di tabel absen_jadwal_slot
UPDATE absen_jadwal_slot SET aktif = false;

-- 2. Hapus slot yang tidak memiliki relasi foreign key riwayat scan
DELETE FROM absen_jadwal_slot 
WHERE id NOT IN (
  SELECT slot_id FROM absen_scan_wajah WHERE slot_id IS NOT NULL
);
