-- ============================================================
-- 018: User App — Multi-Scan Face Recognition System
--
-- Tabel baru:
--   absen_jadwal_slot    — Definisi jadwal scan harian
--   absen_face_data      — Data deskriptor wajah per karyawan
--   absen_scan_wajah     — Record scan wajah per slot per hari
--   absen_master_lokasi  — Master lokasi/zona kerja
--   absen_master_pekerjaan — Master jenis pekerjaan
--
-- Kolom baru di absen_karyawan:
--   no_hp, pin (untuk login user app)
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

-- 1. Tambah kolom login di karyawan
ALTER TABLE absen_karyawan ADD COLUMN IF NOT EXISTS no_hp text;
ALTER TABLE absen_karyawan ADD COLUMN IF NOT EXISTS pin text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_karyawan_no_hp ON absen_karyawan(no_hp) WHERE no_hp IS NOT NULL;

-- 2. Jadwal slot absen harian
CREATE TABLE IF NOT EXISTS absen_jadwal_slot (
  id serial PRIMARY KEY,
  jam time NOT NULL,
  label text NOT NULL,
  jenis text NOT NULL CHECK (jenis IN ('masuk','progress','istirahat','pulang','lembur','pulang_lembur')),
  toleransi_menit integer NOT NULL DEFAULT 15,
  wajib boolean NOT NULL DEFAULT true,
  urutan integer NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Data wajah (face descriptor dari face-api.js)
CREATE TABLE IF NOT EXISTS absen_face_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  karyawan_id uuid NOT NULL REFERENCES absen_karyawan(id) ON DELETE CASCADE,
  descriptor jsonb NOT NULL,
  foto_referensi text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(karyawan_id)
);

-- 4. Record scan wajah per slot
CREATE TABLE IF NOT EXISTS absen_scan_wajah (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  karyawan_id uuid NOT NULL REFERENCES absen_karyawan(id),
  slot_id integer REFERENCES absen_jadwal_slot(id),
  tanggal date NOT NULL DEFAULT CURRENT_DATE,
  waktu_scan timestamptz NOT NULL DEFAULT now(),
  lokasi_kerja text,
  jenis_pekerjaan text,
  keterangan text,
  foto_url text,
  gps_lat numeric(10,7),
  gps_lng numeric(10,7),
  confidence numeric(5,4),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_wajah_karyawan_tanggal ON absen_scan_wajah(karyawan_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_scan_wajah_tanggal ON absen_scan_wajah(tanggal);

-- 5. Master lokasi kerja
CREATE TABLE IF NOT EXISTS absen_master_lokasi (
  id serial PRIMARY KEY,
  nama text NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  urutan integer NOT NULL DEFAULT 0
);

-- 6. Master jenis pekerjaan
CREATE TABLE IF NOT EXISTS absen_master_pekerjaan (
  id serial PRIMARY KEY,
  nama text NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  urutan integer NOT NULL DEFAULT 0
);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE absen_jadwal_slot ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_face_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_scan_wajah ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_master_lokasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_master_pekerjaan ENABLE ROW LEVEL SECURITY;

-- Jadwal slot: semua bisa baca, admin bisa ubah
CREATE POLICY "jadwal_slot_select" ON absen_jadwal_slot FOR SELECT USING (true);
CREATE POLICY "jadwal_slot_all" ON absen_jadwal_slot FOR ALL USING (absen_get_user_role() = 'admin');

-- Face data: semua bisa baca (untuk verifikasi), admin bisa manage
CREATE POLICY "face_data_select" ON absen_face_data FOR SELECT USING (true);
CREATE POLICY "face_data_insert" ON absen_face_data FOR INSERT WITH CHECK (true);
CREATE POLICY "face_data_update" ON absen_face_data FOR UPDATE USING (true);
CREATE POLICY "face_data_delete" ON absen_face_data FOR DELETE USING (absen_get_user_role() = 'admin');

-- Scan wajah: semua bisa baca & insert
CREATE POLICY "scan_wajah_select" ON absen_scan_wajah FOR SELECT USING (true);
CREATE POLICY "scan_wajah_insert" ON absen_scan_wajah FOR INSERT WITH CHECK (true);

-- Master lokasi/pekerjaan: semua bisa baca, admin bisa ubah
CREATE POLICY "master_lokasi_select" ON absen_master_lokasi FOR SELECT USING (true);
CREATE POLICY "master_lokasi_all" ON absen_master_lokasi FOR ALL USING (absen_get_user_role() = 'admin');
CREATE POLICY "master_pekerjaan_select" ON absen_master_pekerjaan FOR SELECT USING (true);
CREATE POLICY "master_pekerjaan_all" ON absen_master_pekerjaan FOR ALL USING (absen_get_user_role() = 'admin');

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- Login user app (karyawan via no_hp + pin)
CREATE OR REPLACE FUNCTION absen_user_login(p_no_hp text, p_pin text)
RETURNS jsonb AS $$
DECLARE
  v_karyawan record;
BEGIN
  SELECT id, nama, jabatan, no_hp, atasan_id, status_aktif
  INTO v_karyawan
  FROM absen_karyawan
  WHERE no_hp = p_no_hp AND pin = p_pin AND status_aktif = true;

  IF v_karyawan IS NULL THEN
    RETURN jsonb_build_object('error', 'No HP atau PIN salah');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'karyawan_id', v_karyawan.id,
    'nama', v_karyawan.nama,
    'jabatan', v_karyawan.jabatan
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get jadwal slot aktif
CREATE OR REPLACE FUNCTION absen_get_jadwal_slot()
RETURNS TABLE (
  id integer,
  jam time,
  label text,
  jenis text,
  toleransi_menit integer,
  wajib boolean,
  urutan integer
) AS $$
  SELECT id, jam, label, jenis, toleransi_menit, wajib, urutan
  FROM absen_jadwal_slot
  WHERE aktif = true
  ORDER BY urutan, jam;
$$ LANGUAGE sql SECURITY DEFINER;

-- Simpan data wajah
CREATE OR REPLACE FUNCTION absen_simpan_face_data(
  p_karyawan_id uuid,
  p_descriptor jsonb,
  p_foto_referensi text DEFAULT NULL
)
RETURNS jsonb AS $$
BEGIN
  INSERT INTO absen_face_data (karyawan_id, descriptor, foto_referensi)
  VALUES (p_karyawan_id, p_descriptor, p_foto_referensi)
  ON CONFLICT (karyawan_id) DO UPDATE SET
    descriptor = EXCLUDED.descriptor,
    foto_referensi = COALESCE(EXCLUDED.foto_referensi, absen_face_data.foto_referensi),
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ambil semua face data (untuk matching di client)
CREATE OR REPLACE FUNCTION absen_get_all_face_data()
RETURNS TABLE (
  karyawan_id uuid,
  nama text,
  descriptor jsonb
) AS $$
  SELECT fd.karyawan_id, k.nama, fd.descriptor
  FROM absen_face_data fd
  JOIN absen_karyawan k ON k.id = fd.karyawan_id
  WHERE k.status_aktif = true;
$$ LANGUAGE sql SECURITY DEFINER;

-- Catat scan wajah + update absen_harian
CREATE OR REPLACE FUNCTION absen_catat_scan_wajah(
  p_karyawan_id uuid,
  p_slot_id integer,
  p_lokasi_kerja text DEFAULT NULL,
  p_jenis_pekerjaan text DEFAULT NULL,
  p_keterangan text DEFAULT NULL,
  p_foto_url text DEFAULT NULL,
  p_gps_lat numeric DEFAULT NULL,
  p_gps_lng numeric DEFAULT NULL,
  p_confidence numeric DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_slot record;
  v_now timestamptz;
  v_now_time time;
  v_tanggal date;
  v_scan_id uuid;
  v_tz text;
BEGIN
  -- Load timezone
  SELECT COALESCE(
    (SELECT value FROM absen_konfigurasi WHERE key = 'zona_waktu'),
    'Asia/Jayapura'
  ) INTO v_tz;

  v_now := now();
  v_now_time := (v_now AT TIME ZONE v_tz)::time;
  v_tanggal := (v_now AT TIME ZONE v_tz)::date;

  -- Validasi slot
  SELECT * INTO v_slot FROM absen_jadwal_slot WHERE id = p_slot_id AND aktif = true;
  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('error', 'Slot tidak ditemukan');
  END IF;

  -- Cek toleransi waktu
  IF v_now_time < (v_slot.jam - (v_slot.toleransi_menit || ' minutes')::interval)
     OR v_now_time > (v_slot.jam + (v_slot.toleransi_menit || ' minutes')::interval) THEN
    RETURN jsonb_build_object(
      'error', 'Di luar jendela waktu',
      'jam_slot', v_slot.jam,
      'toleransi', v_slot.toleransi_menit,
      'waktu_sekarang', v_now_time
    );
  END IF;

  -- Cek apakah sudah scan slot ini hari ini
  IF EXISTS (
    SELECT 1 FROM absen_scan_wajah
    WHERE karyawan_id = p_karyawan_id AND slot_id = p_slot_id AND tanggal = v_tanggal
  ) THEN
    RETURN jsonb_build_object('error', 'Sudah absen untuk slot ini hari ini');
  END IF;

  -- Simpan scan
  v_scan_id := gen_random_uuid();
  INSERT INTO absen_scan_wajah (
    id, karyawan_id, slot_id, tanggal, waktu_scan,
    lokasi_kerja, jenis_pekerjaan, keterangan, foto_url,
    gps_lat, gps_lng, confidence
  ) VALUES (
    v_scan_id, p_karyawan_id, p_slot_id, v_tanggal, v_now,
    p_lokasi_kerja, p_jenis_pekerjaan, p_keterangan, p_foto_url,
    p_gps_lat, p_gps_lng, p_confidence
  );

  -- Update absen_harian berdasarkan jenis slot
  IF v_slot.jenis = 'masuk' THEN
    INSERT INTO absen_harian (karyawan_id, tanggal, jam_masuk, status, sumber)
    VALUES (p_karyawan_id, v_tanggal, v_now_time, 'TANPA_PULANG', 'face_scan')
    ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET
      jam_masuk = EXCLUDED.jam_masuk,
      status = CASE
        WHEN absen_harian.jam_pulang IS NOT NULL THEN 'LENGKAP'
        ELSE 'TANPA_PULANG'
      END,
      sumber = 'face_scan',
      updated_at = now();

  ELSIF v_slot.jenis IN ('pulang', 'pulang_lembur') THEN
    INSERT INTO absen_harian (karyawan_id, tanggal, jam_pulang, status, sumber)
    VALUES (p_karyawan_id, v_tanggal, v_now_time, 'TANPA_MASUK', 'face_scan')
    ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET
      jam_pulang = v_now_time,
      status = CASE
        WHEN absen_harian.jam_masuk IS NOT NULL THEN 'LENGKAP'
        ELSE 'TANPA_MASUK'
      END,
      sumber = 'face_scan',
      updated_at = now();

    -- Hitung lembur jika pulang_lembur
    IF v_slot.jenis = 'pulang_lembur' THEN
      DECLARE
        v_lembur_mulai time;
        v_lembur_maks numeric;
        v_lembur_pembulatan integer;
        v_jam_lembur numeric;
      BEGIN
        SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'lembur_mulai_hitung'), '19:00') INTO v_lembur_mulai;
        SELECT COALESCE((SELECT value::numeric FROM absen_konfigurasi WHERE key = 'lembur_maks_jam'), 4) INTO v_lembur_maks;
        SELECT COALESCE((SELECT value::integer FROM absen_konfigurasi WHERE key = 'lembur_pembulatan_menit'), 15) INTO v_lembur_pembulatan;

        v_jam_lembur := EXTRACT(EPOCH FROM (v_now_time - v_lembur_mulai)) / 3600.0;
        IF v_jam_lembur < 0 THEN v_jam_lembur := 0; END IF;
        IF v_lembur_pembulatan > 0 THEN
          v_jam_lembur := FLOOR(v_jam_lembur * 60 / v_lembur_pembulatan) * v_lembur_pembulatan / 60.0;
        END IF;
        IF v_jam_lembur > v_lembur_maks THEN v_jam_lembur := v_lembur_maks; END IF;

        IF v_jam_lembur > 0 THEN
          UPDATE absen_harian
          SET jam_lembur = v_jam_lembur, status_lembur = 'PENDING_APPROVAL'
          WHERE karyawan_id = p_karyawan_id AND tanggal = v_tanggal;
        END IF;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'scan_id', v_scan_id,
    'waktu', v_now,
    'tanggal', v_tanggal,
    'slot_label', v_slot.label
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get scan history per karyawan per bulan
CREATE OR REPLACE FUNCTION absen_riwayat_scan(
  p_karyawan_id uuid,
  p_bulan integer,
  p_tahun integer
)
RETURNS TABLE (
  tanggal date,
  slot_id integer,
  slot_label text,
  slot_jam time,
  waktu_scan timestamptz,
  lokasi_kerja text,
  jenis_pekerjaan text,
  keterangan text
) AS $$
  SELECT
    sw.tanggal, sw.slot_id, js.label, js.jam,
    sw.waktu_scan, sw.lokasi_kerja, sw.jenis_pekerjaan, sw.keterangan
  FROM absen_scan_wajah sw
  JOIN absen_jadwal_slot js ON js.id = sw.slot_id
  WHERE sw.karyawan_id = p_karyawan_id
    AND EXTRACT(MONTH FROM sw.tanggal) = p_bulan
    AND EXTRACT(YEAR FROM sw.tanggal) = p_tahun
  ORDER BY sw.tanggal DESC, js.urutan;
$$ LANGUAGE sql SECURITY DEFINER;

-- Get scan hari ini per karyawan (untuk timeline beranda)
CREATE OR REPLACE FUNCTION absen_scan_hari_ini(p_karyawan_id uuid)
RETURNS TABLE (
  slot_id integer,
  waktu_scan timestamptz,
  lokasi_kerja text,
  jenis_pekerjaan text
) AS $$
DECLARE
  v_tz text;
  v_today date;
BEGIN
  SELECT COALESCE(
    (SELECT value FROM absen_konfigurasi WHERE key = 'zona_waktu'),
    'Asia/Jayapura'
  ) INTO v_tz;
  v_today := (now() AT TIME ZONE v_tz)::date;

  RETURN QUERY
  SELECT sw.slot_id, sw.waktu_scan, sw.lokasi_kerja, sw.jenis_pekerjaan
  FROM absen_scan_wajah sw
  WHERE sw.karyawan_id = p_karyawan_id AND sw.tanggal = v_today;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CRUD jadwal slot (admin)
CREATE OR REPLACE FUNCTION absen_save_jadwal_slot(p_data jsonb)
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_id integer;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data)
  LOOP
    v_id := (v_item->>'id')::integer;
    IF v_id IS NOT NULL AND v_id > 0 THEN
      UPDATE absen_jadwal_slot SET
        jam = (v_item->>'jam')::time,
        label = v_item->>'label',
        jenis = v_item->>'jenis',
        toleransi_menit = (v_item->>'toleransi_menit')::integer,
        wajib = COALESCE((v_item->>'wajib')::boolean, true),
        urutan = (v_item->>'urutan')::integer,
        aktif = COALESCE((v_item->>'aktif')::boolean, true),
        updated_at = now()
      WHERE id = v_id;
    ELSE
      INSERT INTO absen_jadwal_slot (jam, label, jenis, toleransi_menit, wajib, urutan, aktif)
      VALUES (
        (v_item->>'jam')::time,
        v_item->>'label',
        v_item->>'jenis',
        COALESCE((v_item->>'toleransi_menit')::integer, 15),
        COALESCE((v_item->>'wajib')::boolean, true),
        COALESCE((v_item->>'urutan')::integer, 99),
        COALESCE((v_item->>'aktif')::boolean, true)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get master lokasi
CREATE OR REPLACE FUNCTION absen_get_master_lokasi()
RETURNS TABLE (id integer, nama text) AS $$
  SELECT id, nama FROM absen_master_lokasi WHERE aktif = true ORDER BY urutan, nama;
$$ LANGUAGE sql SECURITY DEFINER;

-- Get master pekerjaan
CREATE OR REPLACE FUNCTION absen_get_master_pekerjaan()
RETURNS TABLE (id integer, nama text) AS $$
  SELECT id, nama FROM absen_master_pekerjaan WHERE aktif = true ORDER BY urutan, nama;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- FIX: Audit trigger — nested IF to avoid accessing import_id on non-harian tables
-- ============================================================

CREATE OR REPLACE FUNCTION absen_audit_trigger_fn()
RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'absen_harian' AND TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.import_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO absen_audit_log (actor_id, action, entity, entity_id, new_value)
    VALUES (auth.uid(), 'INSERT', TG_TABLE_NAME, NEW.id::text, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO absen_audit_log (actor_id, action, entity, entity_id, old_value, new_value)
    VALUES (auth.uid(), 'UPDATE', TG_TABLE_NAME, NEW.id::text, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO absen_audit_log (actor_id, action, entity, entity_id, old_value)
    VALUES (auth.uid(), 'DELETE', TG_TABLE_NAME, OLD.id::text, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- UPDATE: Karyawan CRUD RPCs to support no_hp & pin
-- ============================================================

CREATE OR REPLACE FUNCTION absen_tambah_karyawan(p_data jsonb)
RETURNS jsonb AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO absen_karyawan (nama, uid_mesin, jabatan, gaji_bulanan, tunjangan, tgl_masuk, status_aktif, atasan_id, no_hp, pin)
  VALUES (
    p_data->>'nama',
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_data->'uid_mesin') x), '{}'),
    NULLIF(p_data->>'jabatan', ''),
    COALESCE((p_data->>'gaji_bulanan')::numeric, 0),
    COALESCE((p_data->>'tunjangan')::numeric, 0),
    NULLIF(p_data->>'tgl_masuk', '')::date,
    COALESCE((p_data->>'status_aktif')::boolean, true),
    NULLIF(p_data->>'atasan_id', '')::uuid,
    NULLIF(p_data->>'no_hp', ''),
    NULLIF(p_data->>'pin', '')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION absen_update_karyawan(p_id uuid, p_data jsonb)
RETURNS jsonb AS $$
BEGIN
  UPDATE absen_karyawan SET
    nama = COALESCE(p_data->>'nama', nama),
    uid_mesin = COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_data->'uid_mesin') x), uid_mesin),
    jabatan = NULLIF(p_data->>'jabatan', ''),
    gaji_bulanan = COALESCE((p_data->>'gaji_bulanan')::numeric, gaji_bulanan),
    tunjangan = COALESCE((p_data->>'tunjangan')::numeric, tunjangan),
    tgl_masuk = CASE WHEN p_data ? 'tgl_masuk' THEN NULLIF(p_data->>'tgl_masuk', '')::date ELSE tgl_masuk END,
    status_aktif = COALESCE((p_data->>'status_aktif')::boolean, status_aktif),
    atasan_id = CASE WHEN p_data ? 'atasan_id' THEN NULLIF(p_data->>'atasan_id', '')::uuid ELSE atasan_id END,
    no_hp = CASE WHEN p_data ? 'no_hp' THEN NULLIF(p_data->>'no_hp', '') ELSE no_hp END,
    pin = CASE WHEN p_data ? 'pin' THEN NULLIF(p_data->>'pin', '') ELSE pin END,
    updated_at = now()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Karyawan tidak ditemukan';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SEED: Default jadwal slot
-- ============================================================

INSERT INTO absen_jadwal_slot (jam, label, jenis, toleransi_menit, wajib, urutan) VALUES
  ('08:00', 'Masuk',        'masuk',         15, true,  1),
  ('10:00', 'Progress 1',   'progress',      10, true,  2),
  ('12:25', 'Siang',        'progress',      10, true,  3),
  ('13:00', 'Istirahat',    'istirahat',     15, true,  4),
  ('15:00', 'Progress 2',   'progress',      10, true,  5),
  ('16:30', 'Pulang',       'pulang',        15, true,  6),
  ('19:00', 'Lembur',       'lembur',        10, false, 7),
  ('22:00', 'Pulang Lembur','pulang_lembur', 30, false, 8)
ON CONFLICT DO NOTHING;
