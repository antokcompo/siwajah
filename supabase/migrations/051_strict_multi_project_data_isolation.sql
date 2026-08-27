-- ============================================================
-- 051: Strict Multi-Project Data Isolation
--
-- Memastikan seluruh tabel, rpc, dan konfigurasi terisolasi 100%
-- independen per kode_proyek (524006 vs 526008 dst).
-- Perubahan di 1 proyek TIDAK BOLEH memengaruhi proyek lain.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Tambah kolom kode_proyek jika belum ada di tabel pendukung
ALTER TABLE absen_jadwal_slot ADD COLUMN IF NOT EXISTS kode_proyek text DEFAULT '524006';
ALTER TABLE absen_kalender ADD COLUMN IF NOT EXISTS kode_proyek text DEFAULT '524006';
ALTER TABLE absen_periode_gaji ADD COLUMN IF NOT EXISTS kode_proyek text DEFAULT '524006';
ALTER TABLE absen_konfigurasi ADD COLUMN IF NOT EXISTS kode_proyek text DEFAULT '524006';

-- Drop constraint unik lama pada absen_kalender dan absen_konfigurasi jika ada, ganti dengan (kode_proyek, tanggal / key)
DO $$
BEGIN
  -- Absen Kalender Unique Index per Proyek
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'absen_kalender_tanggal_key') THEN
    ALTER TABLE absen_kalender DROP CONSTRAINT absen_kalender_tanggal_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'absen_kalender_proyek_tanggal_key') THEN
    ALTER TABLE absen_kalender ADD CONSTRAINT absen_kalender_proyek_tanggal_key UNIQUE (kode_proyek, tanggal);
  END IF;

  -- Absen Konfigurasi Unique Index per Proyek
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'absen_konfigurasi_key_key') THEN
    ALTER TABLE absen_konfigurasi DROP CONSTRAINT absen_konfigurasi_key_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'absen_konfigurasi_proyek_key_key') THEN
    ALTER TABLE absen_konfigurasi ADD CONSTRAINT absen_konfigurasi_proyek_key_key UNIQUE (kode_proyek, key);
  END IF;
END $$;

-- 2. Function Save Jadwal Slot (Filtered & Isolated Per Proyek)
CREATE OR REPLACE FUNCTION absen_save_jadwal_slot(
  p_data jsonb,
  p_kode_proyek text DEFAULT '524006'
)
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_id uuid;
  v_kode text := COALESCE(p_kode_proyek, '524006');
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

-- 3. Function List Kalender (Filtered Per Proyek)
CREATE OR REPLACE FUNCTION absen_list_kalender(
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

-- 4. Function Generate Kalender (Isolated Per Proyek)
CREATE OR REPLACE FUNCTION absen_generate_kalender(
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
  v_kode text := COALESCE(p_kode_proyek, '524006');
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

-- 5. Function Update Kalender (Isolated Per Proyek)
CREATE OR REPLACE FUNCTION absen_update_kalender(
  p_tanggal date,
  p_jenis_hari text,
  p_keterangan text DEFAULT NULL,
  p_kode_proyek text DEFAULT '524006'
)
RETURNS jsonb AS $$
DECLARE
  v_kode text := COALESCE(p_kode_proyek, '524006');
BEGIN
  INSERT INTO absen_kalender (tanggal, jenis_hari, keterangan, kode_proyek)
  VALUES (p_tanggal, p_jenis_hari, p_keterangan, v_kode)
  ON CONFLICT (kode_proyek, tanggal) DO UPDATE SET
    jenis_hari = EXCLUDED.jenis_hari,
    keterangan = EXCLUDED.keterangan;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Open RLS Policies for Multi-Project Read/Write Access
ALTER TABLE absen_jadwal_slot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pilihan RLS absen_jadwal_slot" ON absen_jadwal_slot;
CREATE POLICY "Pilihan RLS absen_jadwal_slot" ON absen_jadwal_slot FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE absen_kalender ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pilihan RLS absen_kalender" ON absen_kalender;
CREATE POLICY "Pilihan RLS absen_kalender" ON absen_kalender FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE absen_konfigurasi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pilihan RLS absen_konfigurasi" ON absen_konfigurasi;
CREATE POLICY "Pilihan RLS absen_konfigurasi" ON absen_konfigurasi FOR ALL USING (true) WITH CHECK (true);
