-- ============================================================
-- 063: Optimize absen_save_jadwal_slot RPC (Fast & Instant)
--
-- Mengoptimalkan proses simpan slot jadwal absen agar berjalan 
-- secepat kilat (instan), mendukung semua tipe ID, dan mencegah lemot.
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
  v_id_str text;
  v_kode text := COALESCE(NULLIF(p_kode_proyek, ''), '524006');
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_id_str := v_item->>'id';

    -- 1. Jika ID ada dan bukan temp
    IF v_id_str IS NOT NULL AND v_id_str != '' AND v_id_str NOT LIKE 'temp-%' THEN
      UPDATE absen_jadwal_slot SET
        jam = (v_item->>'jam')::time,
        label = v_item->>'label',
        jenis = v_item->>'jenis',
        toleransi_menit = COALESCE((v_item->>'toleransi_menit')::integer, 15),
        wajib = COALESCE((v_item->>'wajib')::boolean, true),
        urutan = COALESCE((v_item->>'urutan')::integer, 1),
        aktif = COALESCE((v_item->>'aktif')::boolean, true),
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
          COALESCE((v_item->>'aktif')::boolean, true),
          v_kode,
          COALESCE(v_item->>'kategori_shift', 'REGULER')
        );
      END IF;
    ELSE
      -- 2. Jika ID baru / temp, update berdasarkan jam & kategori atau INSERT baru
      UPDATE absen_jadwal_slot SET
        label = v_item->>'label',
        jenis = v_item->>'jenis',
        toleransi_menit = COALESCE((v_item->>'toleransi_menit')::integer, 15),
        wajib = COALESCE((v_item->>'wajib')::boolean, true),
        urutan = COALESCE((v_item->>'urutan')::integer, 1),
        aktif = COALESCE((v_item->>'aktif')::boolean, true)
      WHERE kode_proyek = v_kode 
        AND kategori_shift = COALESCE(v_item->>'kategori_shift', 'REGULER')
        AND jam = (v_item->>'jam')::time;

      IF NOT FOUND THEN
        INSERT INTO absen_jadwal_slot (jam, label, jenis, toleransi_menit, wajib, urutan, aktif, kode_proyek, kategori_shift)
        VALUES (
          (v_item->>'jam')::time,
          v_item->>'label',
          v_item->>'jenis',
          COALESCE((v_item->>'toleransi_menit')::integer, 15),
          COALESCE((v_item->>'wajib')::boolean, true),
          COALESCE((v_item->>'urutan')::integer, 1),
          COALESCE((v_item->>'aktif')::boolean, true),
          v_kode,
          COALESCE(v_item->>'kategori_shift', 'REGULER')
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', jsonb_array_length(p_data));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
