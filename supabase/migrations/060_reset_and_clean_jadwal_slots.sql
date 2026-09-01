-- ============================================================
-- 060: Reset & Clean Up Jadwal Slots (Reguler, Security Pagi, Security Malam)
--
-- Membersihkan duplikasi dan menetapkan slot jam presisi 100% untuk:
-- 1. Reguler Kantor (8 Slot)
-- 2. Security Shift Pagi (7 Slot)
-- 3. Security Shift Malam (6 Slot Lintas Hari)
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

DO $$
DECLARE
  v_proj record;
BEGIN
  -- Hapus slot yang duplikat/rusak
  DELETE FROM absen_jadwal_slot;

  -- Re-insert slot presisi per proyek
  FOR v_proj IN SELECT DISTINCT kode_proyek FROM absen_proyek LOOP
    
    -- 1. REGULER KANTOR (8 Slot)
    INSERT INTO absen_jadwal_slot (jam, label, jenis, toleransi_menit, wajib, urutan, aktif, kode_proyek, kategori_shift)
    VALUES
      ('08:00'::time, 'Pagi', 'masuk', 15, true, 1, true, v_proj.kode_proyek, 'REGULER'),
      ('10:00'::time, 'Progress 1', 'progress', 10, true, 2, true, v_proj.kode_proyek, 'REGULER'),
      ('11:30'::time, 'Siang', 'istirahat', 20, true, 3, true, v_proj.kode_proyek, 'REGULER'),
      ('13:00'::time, 'Siang', 'progress', 15, true, 4, true, v_proj.kode_proyek, 'REGULER'),
      ('15:00'::time, 'Progress 2', 'progress', 15, true, 5, true, v_proj.kode_proyek, 'REGULER'),
      ('17:00'::time, 'Pulang', 'pulang', 15, true, 6, true, v_proj.kode_proyek, 'REGULER'),
      ('19:00'::time, 'Lembur', 'lembur', 15, true, 7, true, v_proj.kode_proyek, 'REGULER'),
      ('00:00'::time, 'Pulang lembur', 'pulang_lembur', 15, true, 8, true, v_proj.kode_proyek, 'REGULER');

    -- 2. SECURITY SHIFT PAGI (7 Slot)
    INSERT INTO absen_jadwal_slot (jam, label, jenis, toleransi_menit, wajib, urutan, aktif, kode_proyek, kategori_shift)
    VALUES
      ('06:00'::time, 'Security Masuk Pagi', 'masuk', 15, true, 101, true, v_proj.kode_proyek, 'SECURITY_PAGI'),
      ('08:00'::time, 'Security Patroli 1', 'progress', 15, true, 102, true, v_proj.kode_proyek, 'SECURITY_PAGI'),
      ('10:00'::time, 'Security Patroli 2', 'progress', 15, true, 103, true, v_proj.kode_proyek, 'SECURITY_PAGI'),
      ('11:30'::time, 'Security Istirahat', 'istirahat', 20, true, 104, true, v_proj.kode_proyek, 'SECURITY_PAGI'),
      ('13:00'::time, 'Security Patroli 3', 'progress', 15, true, 105, true, v_proj.kode_proyek, 'SECURITY_PAGI'),
      ('15:00'::time, 'Security Patroli 4', 'progress', 15, true, 106, true, v_proj.kode_proyek, 'SECURITY_PAGI'),
      ('17:00'::time, 'Security Pulang Pagi', 'pulang', 30, true, 107, true, v_proj.kode_proyek, 'SECURITY_PAGI');

    -- 3. SECURITY SHIFT MALAM (6 Slot Lintas Hari)
    INSERT INTO absen_jadwal_slot (jam, label, jenis, toleransi_menit, wajib, urutan, aktif, kode_proyek, kategori_shift)
    VALUES
      ('17:00'::time, 'Security Masuk Malam', 'masuk', 15, true, 201, true, v_proj.kode_proyek, 'SECURITY_MALAM'),
      ('19:00'::time, 'Security Patroli Malam 1', 'progress', 15, true, 202, true, v_proj.kode_proyek, 'SECURITY_MALAM'),
      ('23:00'::time, 'Security Patroli Malam 2', 'progress', 15, true, 203, true, v_proj.kode_proyek, 'SECURITY_MALAM'),
      ('01:00'::time, 'Security Patroli Subuh 1 (+1)', 'progress', 15, true, 204, true, v_proj.kode_proyek, 'SECURITY_MALAM'),
      ('03:00'::time, 'Security Patroli Subuh 2 (+1)', 'progress', 15, true, 205, true, v_proj.kode_proyek, 'SECURITY_MALAM'),
      ('06:00'::time, 'Security Pulang Malam (+1)', 'pulang', 30, true, 206, true, v_proj.kode_proyek, 'SECURITY_MALAM');

  END LOOP;
END $$;
