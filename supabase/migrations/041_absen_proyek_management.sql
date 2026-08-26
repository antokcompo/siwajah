-- Migration 041: Multi-Project Management table & RPC functions with kode_proyek as PRIMARY KEY

CREATE TABLE IF NOT EXISTS absen_proyek (
  kode_proyek TEXT PRIMARY KEY,
  nama_proyek TEXT NOT NULL,
  nama_singkat TEXT,
  lokasi TEXT,
  zona_waktu TEXT DEFAULT 'Asia/Jayapura',
  tz_label TEXT DEFAULT 'WIT (UTC+9)',
  status TEXT DEFAULT 'AKTIF',
  total_karyawan INT DEFAULT 0,
  deskripsi TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE absen_proyek ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read absen_proyek" ON absen_proyek;
CREATE POLICY "Allow read absen_proyek" ON absen_proyek FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow write absen_proyek" ON absen_proyek;
CREATE POLICY "Allow write absen_proyek" ON absen_proyek FOR ALL USING (true) WITH CHECK (true);

-- Seed initial project 524006 (Portsite Accommodation Complex)
INSERT INTO absen_proyek (kode_proyek, nama_proyek, nama_singkat, lokasi, zona_waktu, tz_label, status, deskripsi)
VALUES ('524006', 'Proyek Portsite Accommodation Complex (524006)', 'Portsite Accommodation Complex', 'Portsite, Papua', 'Asia/Jayapura', 'WIT (UTC+9)', 'AKTIF', 'Proyek Utama Portsite Accommodation Complex. Data presensi & aktifitas harian terintegrasi.')
ON CONFLICT (kode_proyek) DO UPDATE SET
  nama_proyek = EXCLUDED.nama_proyek,
  nama_singkat = EXCLUDED.nama_singkat,
  lokasi = EXCLUDED.lokasi;

-- RPC: Get all active projects
CREATE OR REPLACE FUNCTION absen_get_proyek()
RETURNS SETOF absen_proyek AS $$
BEGIN
  RETURN QUERY SELECT * FROM absen_proyek ORDER BY created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Upsert active project
CREATE OR REPLACE FUNCTION absen_upsert_proyek(
  p_kode_proyek TEXT,
  p_nama_proyek TEXT,
  p_nama_singkat TEXT DEFAULT NULL,
  p_lokasi TEXT DEFAULT NULL,
  p_zona_waktu TEXT DEFAULT 'Asia/Jayapura',
  p_tz_label TEXT DEFAULT 'WIT (UTC+9)',
  p_status TEXT DEFAULT 'AKTIF',
  p_deskripsi TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
BEGIN
  IF p_kode_proyek IS NULL OR TRIM(p_kode_proyek) = '' THEN
    RETURN jsonb_build_object('error', 'Kode Proyek (Primary Key) wajib diisi.');
  END IF;

  INSERT INTO absen_proyek (kode_proyek, nama_proyek, nama_singkat, lokasi, zona_waktu, tz_label, status, deskripsi, updated_at)
  VALUES (
    TRIM(p_kode_proyek),
    TRIM(p_nama_proyek),
    COALESCE(TRIM(p_nama_singkat), TRIM(p_nama_proyek)),
    TRIM(p_lokasi),
    COALESCE(p_zona_waktu, 'Asia/Jayapura'),
    COALESCE(p_tz_label, 'WIT (UTC+9)'),
    COALESCE(p_status, 'AKTIF'),
    TRIM(p_deskripsi),
    NOW()
  )
  ON CONFLICT (kode_proyek) DO UPDATE SET
    nama_proyek = EXCLUDED.nama_proyek,
    nama_singkat = EXCLUDED.nama_singkat,
    lokasi = EXCLUDED.lokasi,
    zona_waktu = EXCLUDED.zona_waktu,
    tz_label = EXCLUDED.tz_label,
    status = EXCLUDED.status,
    deskripsi = EXCLUDED.deskripsi,
    updated_at = NOW();

  RETURN jsonb_build_object('success', true, 'kode_proyek', TRIM(p_kode_proyek));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
