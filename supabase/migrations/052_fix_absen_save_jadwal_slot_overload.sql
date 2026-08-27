-- ============================================================
-- 052: Fix Function Overload Conflict for absen_save_jadwal_slot
--
-- Menghapus seluruh overload function lama yang bentrok di Supabase
-- dan menggantinya dengan 1 fungsi tunggal yang mendukung p_kode_proyek.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- Drop all old overloaded versions of absen_save_jadwal_slot
DROP FUNCTION IF EXISTS public.absen_save_jadwal_slot(jsonb);
DROP FUNCTION IF EXISTS public.absen_save_jadwal_slot(jsonb, text);

-- Re-create single clear function for saving slot schedule
CREATE OR REPLACE FUNCTION public.absen_save_jadwal_slot(
  p_data jsonb,
  p_kode_proyek text DEFAULT '524006'
)
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_id uuid;
  v_kode text := COALESCE(NULLIF(p_kode_proyek, ''), '524006');
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    IF (v_item->>'id') IS NOT NULL AND (v_item->>'id') != '' THEN
      v_id := (v_item->>'id')::uuid;
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
  END LOOP;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old overload versions of kalender functions if any exist
DROP FUNCTION IF EXISTS public.absen_list_kalender(date, date);
DROP FUNCTION IF EXISTS public.absen_list_kalender(date, date, text);
DROP FUNCTION IF EXISTS public.absen_generate_kalender(integer, integer);
DROP FUNCTION IF EXISTS public.absen_generate_kalender(integer, integer, text);
DROP FUNCTION IF EXISTS public.absen_update_kalender(date, text, text);
DROP FUNCTION IF EXISTS public.absen_update_kalender(date, text, text, text);

-- Re-create single clear kalender functions
CREATE OR REPLACE FUNCTION public.absen_list_kalender(
  p_start date,
  p_end date,
  p_kode_proyek text DEFAULT '524006'
)
RETURNS TABLE (
  tanggal date,
  jenis_hari text,
  keterangan text,
  kode_proyek text
) AS $$
BEGIN
  RETURN QUERY
  SELECT k.tanggal, k.jenis_hari, k.keterangan, k.kode_proyek
  FROM absen_kalender k
  WHERE k.tanggal >= p_start AND k.tanggal <= p_end
    AND (k.kode_proyek = p_kode_proyek OR p_kode_proyek IS NULL)
  ORDER BY k.tanggal ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.absen_generate_kalender(
  p_tahun integer,
  p_bulan integer,
  p_kode_proyek text DEFAULT '524006'
)
RETURNS jsonb AS $$
DECLARE
  v_start date;
  v_end date;
  v_curr date;
  v_dow integer;
  v_jenis text;
  v_count integer := 0;
  v_kode text := COALESCE(NULLIF(p_kode_proyek, ''), '524006');
BEGIN
  v_start := make_date(p_tahun, p_bulan, 1);
  v_end := (v_start + interval '1 month' - interval '1 day')::date;

  v_curr := v_start;
  WHILE v_curr <= v_end LOOP
    v_dow := EXTRACT(DOW FROM v_curr);
    IF v_dow = 0 THEN
      v_jenis := 'minggu';
    ELSE
      v_jenis := 'kerja';
    END IF;

    INSERT INTO absen_kalender (tanggal, jenis_hari, keterangan, kode_proyek)
    VALUES (v_curr, v_jenis, NULL, v_kode)
    ON CONFLICT (kode_proyek, tanggal) DO NOTHING;

    v_count := v_count + 1;
    v_curr := v_curr + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'inserted', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.absen_update_kalender(
  p_tanggal date,
  p_jenis_hari text,
  p_keterangan text DEFAULT NULL,
  p_kode_proyek text DEFAULT '524006'
)
RETURNS jsonb AS $$
DECLARE
  v_kode text := COALESCE(NULLIF(p_kode_proyek, ''), '524006');
BEGIN
  INSERT INTO absen_kalender (tanggal, jenis_hari, keterangan, kode_proyek)
  VALUES (p_tanggal, p_jenis_hari, p_keterangan, v_kode)
  ON CONFLICT (kode_proyek, tanggal) DO UPDATE SET
    jenis_hari = EXCLUDED.jenis_hari,
    keterangan = EXCLUDED.keterangan;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
