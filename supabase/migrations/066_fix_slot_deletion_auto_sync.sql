-- ============================================================
-- 066: Fix Slot Deletion & Instant Auto-Sync
--
-- Menjamin penghapusan slot jam absen langsung tersinkronisasi 100%
-- ke database Supabase dan tidak akan pernah muncul kembali.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

CREATE OR REPLACE FUNCTION public.absen_save_jadwal_slot(
  p_data jsonb,
  p_kode_proyek text DEFAULT '524006',
  p_deleted_ids text[] DEFAULT '{}'::text[]
)
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_id_str text;
  v_del_id text;
  v_kode text := COALESCE(NULLIF(p_kode_proyek, ''), '524006');
BEGIN
  -- 1. Nonaktifkan & Hapus secara eksplisit seluruh ID yang dihapus admin
  IF p_deleted_ids IS NOT NULL AND array_length(p_deleted_ids, 1) > 0 THEN
    FOREACH v_del_id IN ARRAY p_deleted_ids LOOP
      UPDATE absen_jadwal_slot SET aktif = false WHERE id::text = v_del_id;
      BEGIN
        DELETE FROM absen_jadwal_slot WHERE id::text = v_del_id;
      EXCEPTION WHEN foreign_key_violation THEN
        -- Tetap nonaktif (aktif = false)
      END;
    END LOOP;
  END IF;

  -- 2. Upsert data aktif
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_id_str := v_item->>'id';

    IF v_id_str IS NOT NULL AND v_id_str != '' AND v_id_str NOT LIKE 'temp-%' THEN
      UPDATE absen_jadwal_slot SET
        jam = (v_item->>'jam')::time,
        label = v_item->>'label',
        jenis = v_item->>'jenis',
        toleransi_menit = COALESCE((v_item->>'toleransi_menit')::integer, 15),
        wajib = COALESCE((v_item->>'wajib')::boolean, true),
        urutan = COALESCE((v_item->>'urutan')::integer, 1),
        aktif = true,
        kategori_shift = COALESCE(v_item->>'kategori_shift', 'REGULER'),
        kode_proyek = v_kode
      WHERE id::text = v_id_str;
      
      IF NOT FOUND THEN
        INSERT INTO absen_jadwal_slot (jam, label, jenis, toleransi_menit, wajib, urutan, aktif, kode_proyek, kategori_shift)
        VALUES (
          (v_item->>'jam')::time,
          v_item->>'label',
          v_item->>'jenis',
          COALESCE((v_item->>'toleransi_menit')::integer, 15),
          COALESCE((v_item->>'wajib')::boolean, true),
          COALESCE((v_item->>'urutan')::integer, 1),
          true,
          v_kode,
          COALESCE(v_item->>'kategori_shift', 'REGULER')
        );
      END IF;
    ELSE
      -- Insert baru
      INSERT INTO absen_jadwal_slot (jam, label, jenis, toleransi_menit, wajib, urutan, aktif, kode_proyek, kategori_shift)
      VALUES (
        (v_item->>'jam')::time,
        v_item->>'label',
        v_item->>'jenis',
        COALESCE((v_item->>'toleransi_menit')::integer, 15),
        COALESCE((v_item->>'wajib')::boolean, true),
        COALESCE((v_item->>'urutan')::integer, 1),
        true,
        v_kode,
        COALESCE(v_item->>'kategori_shift', 'REGULER')
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', jsonb_array_length(p_data));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
