-- ============================================================
-- 057: Fix Save Jadwal Slot (Include Kategori Shift & Direct Update)
--
-- Memastikan RPC absen_save_jadwal_slot memperbarui kolom
-- kategori_shift, label, jam, jenis, toleransi_menit, wajib, dan urutan secara presisi.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

CREATE OR REPLACE FUNCTION public.absen_save_jadwal_slot(
  p_data jsonb,
  p_kode_proyek text DEFAULT '524006'
)
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_id uuid;
  v_id_str text;
  v_kode text := COALESCE(NULLIF(p_kode_proyek, ''), '524006');
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_id_str := v_item->>'id';

    IF v_id_str IS NOT NULL 
       AND v_id_str != '' 
       AND v_id_str ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_id := v_id_str::uuid;
      UPDATE absen_jadwal_slot SET
        jam = (v_item->>'jam')::time,
        label = v_item->>'label',
        jenis = v_item->>'jenis',
        toleransi_menit = (v_item->>'toleransi_menit')::integer,
        wajib = (v_item->>'wajib')::boolean,
        urutan = (v_item->>'urutan')::integer,
        aktif = (v_item->>'aktif')::boolean,
        kategori_shift = COALESCE(v_item->>'kategori_shift', 'REGULER'),
        kode_proyek = v_kode
      WHERE id = v_id;
    ELSE
      UPDATE absen_jadwal_slot SET
        jam = (v_item->>'jam')::time,
        label = v_item->>'label',
        jenis = v_item->>'jenis',
        toleransi_menit = (v_item->>'toleransi_menit')::integer,
        wajib = (v_item->>'wajib')::boolean,
        aktif = (v_item->>'aktif')::boolean,
        kategori_shift = COALESCE(v_item->>'kategori_shift', 'REGULER')
      WHERE kode_proyek = v_kode 
        AND (urutan = (v_item->>'urutan')::integer AND kategori_shift = COALESCE(v_item->>'kategori_shift', 'REGULER'));

      IF NOT FOUND THEN
        INSERT INTO absen_jadwal_slot (jam, label, jenis, toleransi_menit, wajib, urutan, aktif, kode_proyek, kategori_shift)
        VALUES (
          (v_item->>'jam')::time,
          v_item->>'label',
          v_item->>'jenis',
          COALESCE((v_item->>'toleransi_menit')::integer, 15),
          COALESCE((v_item->>'wajib')::boolean, true),
          (v_item->>'urutan')::integer,
          COALESCE((v_item->>'aktif')::boolean, true),
          v_kode,
          COALESCE(v_item->>'kategori_shift', 'REGULER')
        );
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
