-- ============================================================
-- 053: Fix UUID Casting for absen_save_jadwal_slot
--
-- Menangani input ID non-UUID (seperti "1", "2") agar PL/pgSQL
-- tidak pernah melempar error: invalid input syntax for type uuid: "1".
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

    -- Validasi apakah v_id_str adalah format UUID resmi (36 karakter dengan 4 dash)
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
        kode_proyek = v_kode
      WHERE id = v_id;
    ELSE
      -- Jika ID bukan UUID (seperti "1", "2"), update berdasarkan (kode_proyek, urutan) atau INSERT baru
      UPDATE absen_jadwal_slot SET
        jam = (v_item->>'jam')::time,
        label = v_item->>'label',
        jenis = v_item->>'jenis',
        toleransi_menit = (v_item->>'toleransi_menit')::integer,
        wajib = (v_item->>'wajib')::boolean,
        aktif = (v_item->>'aktif')::boolean
      WHERE kode_proyek = v_kode AND urutan = (v_item->>'urutan')::integer;

      IF NOT FOUND THEN
        INSERT INTO absen_jadwal_slot (jam, label, jenis, toleransi_menit, wajib, urutan, aktif, kode_proyek)
        VALUES (
          (v_item->>'jam')::time,
          v_item->>'label',
          v_item->>'jenis',
          COALESCE((v_item->>'toleransi_menit')::integer, 15),
          COALESCE((v_item->>'wajib')::boolean, true),
          (v_item->>'urutan')::integer,
          COALESCE((v_item->>'aktif')::boolean, true),
          v_kode
        );
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
