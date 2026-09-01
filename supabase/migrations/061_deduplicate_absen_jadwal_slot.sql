-- ============================================================
-- 061: Deduplicate Jadwal Slots (Disable Duplicate Slot Rows)
--
-- Menonaktifkan slot jam absen duplikat (double-double) pada tabel
-- absen_jadwal_slot secara aman tanpa melanggar foreign key constraint.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

DO $$
BEGIN
  -- 1. Selaraskan kategori_shift yang null ke 'REGULER'
  UPDATE absen_jadwal_slot
  SET kategori_shift = 'REGULER'
  WHERE kategori_shift IS NULL OR kategori_shift = '';

  -- 2. Nonaktifkan (aktif = false) seluruh baris duplikat yang memiliki (kode_proyek, kategori_shift, jam, label) sama
  WITH ranked_slots AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY COALESCE(kode_proyek, '524006'), COALESCE(kategori_shift, 'REGULER'), jam, label 
             ORDER BY created_at DESC, id DESC
           ) as rn
    FROM absen_jadwal_slot
  )
  UPDATE absen_jadwal_slot
  SET aktif = false
  WHERE id IN (
    SELECT id FROM ranked_slots WHERE rn > 1
  );

END $$;
