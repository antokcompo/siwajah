-- ============================================================
-- 023: Laporan Absen Terlewat & Izin Pekerja
--
-- Tabel baru:
--   - absen_laporan_terlewat: laporan scan yang terlewat
--   - absen_izin: pengajuan izin (paid/unpaid)
--
-- Status baru di absen_harian:
--   - IZIN_BERBAYAR: dihitung hadir (gaji tetap)
--   - IZIN_TIDAK_BERBAYAR: tidak dihitung gaji
--   - LAPORAN_DITERIMA: absen terlewat yang disetujui admin
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Tabel laporan absen terlewat
CREATE TABLE IF NOT EXISTS absen_laporan_terlewat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  karyawan_id uuid NOT NULL REFERENCES absen_karyawan(id),
  tanggal date NOT NULL,
  slot_id integer REFERENCES absen_jadwal_slot(id),
  alasan text NOT NULL,
  foto_url text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  catatan_admin text,
  approved_by uuid REFERENCES absen_user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_laporan_terlewat_karyawan ON absen_laporan_terlewat(karyawan_id);
CREATE INDEX IF NOT EXISTS idx_laporan_terlewat_status ON absen_laporan_terlewat(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_laporan_terlewat_unique ON absen_laporan_terlewat(karyawan_id, tanggal, slot_id) WHERE status != 'REJECTED';

ALTER TABLE absen_laporan_terlewat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "laporan_terlewat_all" ON absen_laporan_terlewat;
CREATE POLICY "laporan_terlewat_all" ON absen_laporan_terlewat FOR ALL USING (true) WITH CHECK (true);

-- 2. Tabel izin pekerja
CREATE TABLE IF NOT EXISTS absen_izin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  karyawan_id uuid NOT NULL REFERENCES absen_karyawan(id),
  tanggal_mulai date NOT NULL,
  tanggal_selesai date NOT NULL,
  jenis text NOT NULL CHECK (jenis IN ('PAID', 'UNPAID')),
  alasan text NOT NULL,
  foto_url text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  catatan_admin text,
  approved_by uuid REFERENCES absen_user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT izin_tanggal_valid CHECK (tanggal_selesai >= tanggal_mulai)
);

CREATE INDEX IF NOT EXISTS idx_izin_karyawan ON absen_izin(karyawan_id);
CREATE INDEX IF NOT EXISTS idx_izin_status ON absen_izin(status);

ALTER TABLE absen_izin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "izin_all" ON absen_izin;
CREATE POLICY "izin_all" ON absen_izin FOR ALL USING (true) WITH CHECK (true);

-- 3. RPC: Submit laporan absen terlewat
CREATE OR REPLACE FUNCTION absen_lapor_terlewat(
  p_karyawan_id uuid,
  p_tanggal date,
  p_slot_id integer,
  p_alasan text,
  p_foto_url text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_alasan IS NULL OR length(trim(p_alasan)) < 5 THEN
    RETURN jsonb_build_object('error', 'Alasan harus minimal 5 karakter');
  END IF;

  IF EXISTS (
    SELECT 1 FROM absen_laporan_terlewat
    WHERE karyawan_id = p_karyawan_id AND tanggal = p_tanggal AND slot_id = p_slot_id AND status != 'REJECTED'
  ) THEN
    RETURN jsonb_build_object('error', 'Laporan untuk slot ini sudah pernah diajukan');
  END IF;

  INSERT INTO absen_laporan_terlewat (karyawan_id, tanggal, slot_id, alasan, foto_url)
  VALUES (p_karyawan_id, p_tanggal, p_slot_id, trim(p_alasan), p_foto_url)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RPC: Submit izin
CREATE OR REPLACE FUNCTION absen_ajukan_izin(
  p_karyawan_id uuid,
  p_tanggal_mulai date,
  p_tanggal_selesai date,
  p_jenis text,
  p_alasan text,
  p_foto_url text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_jenis NOT IN ('PAID', 'UNPAID') THEN
    RETURN jsonb_build_object('error', 'Jenis izin harus PAID atau UNPAID');
  END IF;

  IF p_tanggal_selesai < p_tanggal_mulai THEN
    RETURN jsonb_build_object('error', 'Tanggal selesai harus >= tanggal mulai');
  END IF;

  IF p_alasan IS NULL OR length(trim(p_alasan)) < 5 THEN
    RETURN jsonb_build_object('error', 'Alasan harus minimal 5 karakter');
  END IF;

  IF EXISTS (
    SELECT 1 FROM absen_izin
    WHERE karyawan_id = p_karyawan_id
      AND status != 'REJECTED'
      AND (p_tanggal_mulai, p_tanggal_selesai) OVERLAPS (tanggal_mulai, tanggal_selesai + 1)
  ) THEN
    RETURN jsonb_build_object('error', 'Sudah ada izin yang tumpang tindih pada tanggal tersebut');
  END IF;

  INSERT INTO absen_izin (karyawan_id, tanggal_mulai, tanggal_selesai, jenis, alasan, foto_url)
  VALUES (p_karyawan_id, p_tanggal_mulai, p_tanggal_selesai, p_jenis, trim(p_alasan), p_foto_url)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: Admin approve/reject laporan terlewat
CREATE OR REPLACE FUNCTION absen_proses_laporan(
  p_laporan_id uuid,
  p_status text,
  p_catatan text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_lap record;
  v_slot record;
BEGIN
  IF p_status NOT IN ('APPROVED', 'REJECTED') THEN
    RETURN jsonb_build_object('error', 'Status harus APPROVED atau REJECTED');
  END IF;

  SELECT * INTO v_lap FROM absen_laporan_terlewat WHERE id = p_laporan_id;
  IF v_lap IS NULL THEN
    RETURN jsonb_build_object('error', 'Laporan tidak ditemukan');
  END IF;

  IF v_lap.status != 'PENDING' THEN
    RETURN jsonb_build_object('error', 'Laporan sudah diproses');
  END IF;

  UPDATE absen_laporan_terlewat
  SET status = p_status, catatan_admin = p_catatan, approved_by = p_user_id, updated_at = now()
  WHERE id = p_laporan_id;

  IF p_status = 'APPROVED' THEN
    SELECT * INTO v_slot FROM absen_jadwal_slot WHERE id = v_lap.slot_id;

    IF v_slot.jenis = 'masuk' THEN
      INSERT INTO absen_harian (karyawan_id, tanggal, jam_masuk, status, sumber)
      VALUES (v_lap.karyawan_id, v_lap.tanggal, v_slot.jam, 'LAPORAN_DITERIMA', 'laporan')
      ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET
        jam_masuk = COALESCE(absen_harian.jam_masuk, v_slot.jam),
        status = CASE
          WHEN absen_harian.jam_pulang IS NOT NULL THEN 'LENGKAP'
          ELSE 'LAPORAN_DITERIMA'
        END,
        sumber = 'laporan',
        updated_at = now();
    ELSIF v_slot.jenis IN ('pulang', 'pulang_lembur') THEN
      INSERT INTO absen_harian (karyawan_id, tanggal, jam_pulang, status, sumber)
      VALUES (v_lap.karyawan_id, v_lap.tanggal, v_slot.jam, 'LAPORAN_DITERIMA', 'laporan')
      ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET
        jam_pulang = COALESCE(absen_harian.jam_pulang, v_slot.jam),
        status = CASE
          WHEN absen_harian.jam_masuk IS NOT NULL THEN 'LENGKAP'
          ELSE 'LAPORAN_DITERIMA'
        END,
        sumber = 'laporan',
        updated_at = now();
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: Admin approve/reject izin (with optional jenis override)
CREATE OR REPLACE FUNCTION absen_proses_izin(
  p_izin_id uuid,
  p_status text,
  p_catatan text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_jenis text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_izin record;
  v_d date;
  v_jenis_final text;
  v_harian_status text;
BEGIN
  IF p_status NOT IN ('APPROVED', 'REJECTED') THEN
    RETURN jsonb_build_object('error', 'Status harus APPROVED atau REJECTED');
  END IF;

  SELECT * INTO v_izin FROM absen_izin WHERE id = p_izin_id;
  IF v_izin IS NULL THEN
    RETURN jsonb_build_object('error', 'Izin tidak ditemukan');
  END IF;

  IF v_izin.status != 'PENDING' THEN
    RETURN jsonb_build_object('error', 'Izin sudah diproses');
  END IF;

  v_jenis_final := COALESCE(p_jenis, v_izin.jenis);
  IF v_jenis_final NOT IN ('PAID', 'UNPAID') THEN
    RETURN jsonb_build_object('error', 'Jenis izin harus PAID atau UNPAID');
  END IF;

  UPDATE absen_izin
  SET status = p_status,
      jenis = v_jenis_final,
      catatan_admin = p_catatan,
      approved_by = p_user_id,
      updated_at = now()
  WHERE id = p_izin_id;

  IF p_status = 'APPROVED' THEN
    v_harian_status := CASE WHEN v_jenis_final = 'PAID' THEN 'IZIN_BERBAYAR' ELSE 'IZIN_TIDAK_BERBAYAR' END;

    FOR v_d IN SELECT generate_series(v_izin.tanggal_mulai, v_izin.tanggal_selesai, '1 day'::interval)::date
    LOOP
      INSERT INTO absen_harian (karyawan_id, tanggal, status, sumber)
      VALUES (v_izin.karyawan_id, v_d, v_harian_status, 'izin')
      ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET
        status = v_harian_status,
        sumber = 'izin',
        updated_at = now();
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
