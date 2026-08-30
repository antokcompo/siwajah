-- ============================================================
-- 054: Security 2-Shift & Roster Jaga Security System
--
-- Menyediakan struktur tabel roster security, penanda shift
-- (PAGI, MALAM, OFF), slot khusus security, dan RPC pengelolaannya.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Tabel Roster Security per Proyek
CREATE TABLE IF NOT EXISTS absen_roster_security (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  karyawan_id uuid NOT NULL REFERENCES absen_karyawan(id) ON DELETE CASCADE,
  tanggal date NOT NULL,
  shift text NOT NULL DEFAULT 'PAGI', -- 'PAGI', 'MALAM', 'OFF'
  kode_proyek text NOT NULL DEFAULT '524006',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index & Unique Constraint per Proyek
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'absen_roster_security_proyek_emp_tgl_key') THEN
    ALTER TABLE absen_roster_security ADD CONSTRAINT absen_roster_security_proyek_emp_tgl_key UNIQUE (kode_proyek, karyawan_id, tanggal);
  END IF;
END $$;

-- 2. Tambah kolom kategori_shift pada absen_jadwal_slot jika belum ada
ALTER TABLE absen_jadwal_slot ADD COLUMN IF NOT EXISTS kategori_shift text DEFAULT 'REGULER';

-- 3. Inisialisasi Slot Standar Security Shift Pagi (7 Slot) dan Shift Malam (6 Slot Lintas Hari) per Proyek
DO $$
DECLARE
  v_proj record;
BEGIN
  FOR v_proj IN SELECT DISTINCT kode_proyek FROM absen_proyek LOOP
    -- Shift Pagi Security (7 slot: 06:00, 08:00, 10:00, 11:30, 13:00, 15:00, 17:00)
    INSERT INTO absen_jadwal_slot (jam, label, jenis, toleransi_menit, wajib, urutan, aktif, kode_proyek, kategori_shift)
    VALUES
      ('06:00'::time, 'Security Masuk Pagi', 'masuk', 15, true, 101, true, v_proj.kode_proyek, 'SECURITY_PAGI'),
      ('08:00'::time, 'Security Patroli 1', 'progress', 15, true, 102, true, v_proj.kode_proyek, 'SECURITY_PAGI'),
      ('10:00'::time, 'Security Patroli 2', 'progress', 15, true, 103, true, v_proj.kode_proyek, 'SECURITY_PAGI'),
      ('11:30'::time, 'Security Istirahat', 'istirahat', 20, true, 104, true, v_proj.kode_proyek, 'SECURITY_PAGI'),
      ('13:00'::time, 'Security Patroli 3', 'progress', 15, true, 105, true, v_proj.kode_proyek, 'SECURITY_PAGI'),
      ('15:00'::time, 'Security Patroli 4', 'progress', 15, true, 106, true, v_proj.kode_proyek, 'SECURITY_PAGI'),
      ('17:00'::time, 'Security Pulang Pagi', 'pulang', 30, true, 107, true, v_proj.kode_proyek, 'SECURITY_PAGI')
    ON CONFLICT DO NOTHING;

    -- Shift Malam Security (6 slot: 17:00, 19:00, 23:00, 01:00, 03:00, 06:00)
    INSERT INTO absen_jadwal_slot (jam, label, jenis, toleransi_menit, wajib, urutan, aktif, kode_proyek, kategori_shift)
    VALUES
      ('17:00'::time, 'Security Masuk Malam', 'masuk', 15, true, 201, true, v_proj.kode_proyek, 'SECURITY_MALAM'),
      ('19:00'::time, 'Security Patroli Malam 1', 'progress', 15, true, 202, true, v_proj.kode_proyek, 'SECURITY_MALAM'),
      ('23:00'::time, 'Security Patroli Malam 2', 'progress', 15, true, 203, true, v_proj.kode_proyek, 'SECURITY_MALAM'),
      ('01:00'::time, 'Security Patroli Subuh 1 (+1)', 'progress', 15, true, 204, true, v_proj.kode_proyek, 'SECURITY_MALAM'),
      ('03:00'::time, 'Security Patroli Subuh 2 (+1)', 'progress', 15, true, 205, true, v_proj.kode_proyek, 'SECURITY_MALAM'),
      ('06:00'::time, 'Security Pulang Malam (+1)', 'pulang', 30, true, 206, true, v_proj.kode_proyek, 'SECURITY_MALAM')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 4. RPC Fetch Roster Security Per Rentang Tanggal & Proyek
CREATE OR REPLACE FUNCTION absen_get_roster_security(
  p_start date,
  p_end date,
  p_kode_proyek text DEFAULT '524006'
)
RETURNS TABLE (
  id uuid,
  karyawan_id uuid,
  karyawan_nama text,
  jabatan text,
  tanggal date,
  shift text,
  kode_proyek text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    k.id AS karyawan_id,
    k.nama AS karyawan_nama,
    k.jabatan,
    r.tanggal,
    r.shift,
    r.kode_proyek
  FROM absen_karyawan k
  LEFT JOIN absen_roster_security r ON r.karyawan_id = k.id AND r.tanggal >= p_start AND r.tanggal <= p_end
  WHERE k.kode_proyek = p_kode_proyek
    AND (k.jabatan ILIKE '%security%' OR k.jabatan ILIKE '%satpam%' OR k.jabatan ILIKE '%sec%')
    AND k.status_aktif = true
  ORDER BY k.nama, r.tanggal ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC Save/Batch Update Roster Security
CREATE OR REPLACE FUNCTION absen_save_roster_security(
  p_data jsonb,
  p_kode_proyek text DEFAULT '524006'
)
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_kode text := COALESCE(NULLIF(p_kode_proyek, ''), '524006');
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    INSERT INTO absen_roster_security (karyawan_id, tanggal, shift, kode_proyek, updated_at)
    VALUES (
      (v_item->>'karyawan_id')::uuid,
      (v_item->>'tanggal')::date,
      UPPER(v_item->>'shift'),
      v_kode,
      now()
    )
    ON CONFLICT (kode_proyek, karyawan_id, tanggal) DO UPDATE SET
      shift = EXCLUDED.shift,
      updated_at = now();
  END LOOP;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Open RLS Policy for absen_roster_security
ALTER TABLE absen_roster_security ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pilihan RLS absen_roster_security" ON absen_roster_security;
CREATE POLICY "Pilihan RLS absen_roster_security" ON absen_roster_security FOR ALL USING (true) WITH CHECK (true);
