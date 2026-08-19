-- ============================================================
-- SISTEM ABSENSI & PENGGAJIAN HARIAN
-- Migration 001: Tables, Indexes, RLS, Functions, Triggers
-- Semua tabel menggunakan prefix absen_
-- ============================================================

-- ============================================================
-- 1. TABLES
-- ============================================================

-- User profiles (linked to Supabase Auth)
CREATE TABLE absen_user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nama text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','atasan','hrd','manajemen')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Karyawan (pekerja harian proyek)
CREATE TABLE absen_karyawan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid_mesin text[] NOT NULL DEFAULT '{}',
  nama text NOT NULL,
  jabatan text,
  gaji_bulanan numeric(15,2) DEFAULT 0,
  tunjangan numeric(15,2) DEFAULT 0,
  tgl_masuk date,
  tgl_keluar date,
  status_aktif boolean DEFAULT true,
  atasan_id uuid REFERENCES absen_user_profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Konfigurasi sistem
CREATE TABLE absen_konfigurasi (
  id serial PRIMARY KEY,
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  deskripsi text,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT now()
);

-- Kalender kerja
CREATE TABLE absen_kalender (
  id serial PRIMARY KEY,
  tanggal date UNIQUE NOT NULL,
  jenis_hari text NOT NULL CHECK (jenis_hari IN ('kerja','libur_nasional','libur_perusahaan','minggu')),
  keterangan text,
  created_at timestamptz DEFAULT now()
);

-- Import log
CREATE TABLE absen_import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_file text NOT NULL,
  jumlah_baris integer DEFAULT 0,
  tanggal_mulai date,
  tanggal_akhir date,
  uid_tidak_dikenal text[] DEFAULT '{}',
  status text DEFAULT 'success' CHECK (status IN ('success','failed')),
  catatan text,
  diimport_oleh uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Scan mentah (immutable)
CREATE TABLE absen_scan_mentah (
  id bigserial PRIMARY KEY,
  uid_mesin text NOT NULL,
  timestamp_scan timestamptz NOT NULL,
  data_mentah jsonb,
  import_id uuid REFERENCES absen_import_log(id) ON DELETE CASCADE,
  karyawan_id uuid REFERENCES absen_karyawan(id),
  is_duplikat boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Periode gaji
CREATE TABLE absen_periode_gaji (
  id serial PRIMARY KEY,
  bulan integer NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  tahun integer NOT NULL CHECK (tahun BETWEEN 2020 AND 2100),
  status text DEFAULT 'buka' CHECK (status IN ('buka','tutup')),
  ditutup_oleh uuid REFERENCES auth.users(id),
  ditutup_at timestamptz,
  dibuka_oleh uuid REFERENCES auth.users(id),
  dibuka_at timestamptz,
  alasan_buka text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(bulan, tahun)
);

-- Absensi harian (calculated)
CREATE TABLE absen_harian (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  karyawan_id uuid NOT NULL REFERENCES absen_karyawan(id),
  tanggal date NOT NULL,
  jam_masuk time,
  jam_pulang time,
  status text NOT NULL CHECK (status IN ('LENGKAP','TANPA_PULANG','TANPA_MASUK','HANYA_SCAN_TENGAH','TIDAK_ADA_SCAN','INSIDEN')),
  jam_lembur numeric(4,2) DEFAULT 0,
  status_lembur text CHECK (status_lembur IN ('PENDING_APPROVAL','APPROVED','REJECTED')),
  sumber text DEFAULT 'sistem' CHECK (sumber IN ('sistem','koreksi')),
  is_insiden boolean DEFAULT false,
  catatan text,
  import_id uuid REFERENCES absen_import_log(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(karyawan_id, tanggal)
);

-- Koreksi log (immutable audit)
CREATE TABLE absen_koreksi_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  absensi_id uuid NOT NULL REFERENCES absen_harian(id),
  karyawan_id uuid NOT NULL REFERENCES absen_karyawan(id),
  tanggal date NOT NULL,
  jam_masuk_lama time,
  jam_pulang_lama time,
  status_lama text,
  jam_masuk_baru time,
  jam_pulang_baru time,
  status_baru text,
  alasan text NOT NULL,
  dikoreksi_oleh uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Gaji bulanan
CREATE TABLE absen_gaji_bulanan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  karyawan_id uuid NOT NULL REFERENCES absen_karyawan(id),
  bulan integer NOT NULL,
  tahun integer NOT NULL,
  hari_kerja integer DEFAULT 0,
  jam_lembur_total numeric(6,2) DEFAULT 0,
  gaji_pokok numeric(15,2) DEFAULT 0,
  gaji_lembur numeric(15,2) DEFAULT 0,
  tunjangan numeric(15,2) DEFAULT 0,
  potongan numeric(15,2) DEFAULT 0,
  total_gaji numeric(15,2) DEFAULT 0,
  status text DEFAULT 'draft' CHECK (status IN ('draft','final')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(karyawan_id, bulan, tahun)
);

-- Audit log
CREATE TABLE absen_audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

CREATE INDEX idx_karyawan_uid ON absen_karyawan USING GIN (uid_mesin);
CREATE INDEX idx_karyawan_aktif ON absen_karyawan (status_aktif);
CREATE INDEX idx_scan_import ON absen_scan_mentah (import_id);
CREATE INDEX idx_scan_uid ON absen_scan_mentah (uid_mesin);
CREATE INDEX idx_scan_ts ON absen_scan_mentah (timestamp_scan);
CREATE INDEX idx_scan_karyawan ON absen_scan_mentah (karyawan_id);
CREATE INDEX idx_harian_tanggal ON absen_harian (tanggal);
CREATE INDEX idx_harian_status ON absen_harian (status);
CREATE INDEX idx_harian_karyawan ON absen_harian (karyawan_id);
CREATE INDEX idx_harian_lembur ON absen_harian (status_lembur) WHERE status_lembur IS NOT NULL;
CREATE INDEX idx_koreksi_absensi ON absen_koreksi_log (absensi_id);
CREATE INDEX idx_gaji_periode ON absen_gaji_bulanan (bulan, tahun);
CREATE INDEX idx_audit_entity ON absen_audit_log (entity, entity_id);
CREATE INDEX idx_audit_created ON absen_audit_log (created_at DESC);
CREATE INDEX idx_kalender_tanggal ON absen_kalender (tanggal);

-- ============================================================
-- 3. HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION absen_get_user_role()
RETURNS text AS $$
  SELECT role FROM absen_user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION absen_is_admin_or_hrd()
RETURNS boolean AS $$
  SELECT absen_get_user_role() IN ('admin', 'hrd');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 4. RLS POLICIES
-- ============================================================

ALTER TABLE absen_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_karyawan ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_konfigurasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_kalender ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_import_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_scan_mentah ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_periode_gaji ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_harian ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_koreksi_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_gaji_bulanan ENABLE ROW LEVEL SECURITY;
ALTER TABLE absen_audit_log ENABLE ROW LEVEL SECURITY;

-- User profiles: semua user bisa lihat, admin bisa ubah
CREATE POLICY "user_profiles_select" ON absen_user_profiles FOR SELECT USING (true);
CREATE POLICY "user_profiles_insert" ON absen_user_profiles FOR INSERT WITH CHECK (absen_get_user_role() = 'admin' OR id = auth.uid());
CREATE POLICY "user_profiles_update" ON absen_user_profiles FOR UPDATE USING (absen_get_user_role() = 'admin');

-- Karyawan: admin/hrd bisa semua, atasan lihat timnya, manajemen lihat semua
CREATE POLICY "karyawan_select" ON absen_karyawan FOR SELECT USING (
  absen_get_user_role() IN ('admin','hrd','manajemen')
  OR (absen_get_user_role() = 'atasan' AND atasan_id = auth.uid())
);
CREATE POLICY "karyawan_insert" ON absen_karyawan FOR INSERT WITH CHECK (absen_get_user_role() = 'admin');
CREATE POLICY "karyawan_update" ON absen_karyawan FOR UPDATE USING (absen_get_user_role() IN ('admin','hrd'));
CREATE POLICY "karyawan_delete" ON absen_karyawan FOR DELETE USING (absen_get_user_role() = 'admin');

-- Konfigurasi: semua bisa lihat, admin bisa ubah
CREATE POLICY "konfig_select" ON absen_konfigurasi FOR SELECT USING (true);
CREATE POLICY "konfig_all" ON absen_konfigurasi FOR ALL USING (absen_get_user_role() = 'admin');

-- Kalender: semua bisa lihat, admin bisa ubah
CREATE POLICY "kalender_select" ON absen_kalender FOR SELECT USING (true);
CREATE POLICY "kalender_all" ON absen_kalender FOR ALL USING (absen_get_user_role() = 'admin');

-- Import log: semua bisa lihat, admin/atasan/hrd bisa insert
CREATE POLICY "import_select" ON absen_import_log FOR SELECT USING (true);
CREATE POLICY "import_insert" ON absen_import_log FOR INSERT WITH CHECK (absen_get_user_role() IN ('admin','atasan','hrd'));

-- Scan mentah: semua bisa lihat
CREATE POLICY "scan_select" ON absen_scan_mentah FOR SELECT USING (true);
CREATE POLICY "scan_insert" ON absen_scan_mentah FOR INSERT WITH CHECK (absen_get_user_role() IN ('admin','atasan','hrd'));

-- Periode gaji: semua bisa lihat, admin/hrd bisa ubah
CREATE POLICY "periode_select" ON absen_periode_gaji FOR SELECT USING (true);
CREATE POLICY "periode_all" ON absen_periode_gaji FOR ALL USING (absen_is_admin_or_hrd());

-- Absensi harian: sama seperti karyawan + atasan bisa update (koreksi)
CREATE POLICY "harian_select" ON absen_harian FOR SELECT USING (
  absen_get_user_role() IN ('admin','hrd','manajemen')
  OR (absen_get_user_role() = 'atasan' AND karyawan_id IN (
    SELECT id FROM absen_karyawan WHERE atasan_id = auth.uid()
  ))
);
CREATE POLICY "harian_insert" ON absen_harian FOR INSERT WITH CHECK (absen_get_user_role() IN ('admin','hrd','atasan'));
CREATE POLICY "harian_update" ON absen_harian FOR UPDATE USING (
  absen_get_user_role() IN ('admin','atasan')
);

-- Koreksi log: admin/hrd/atasan bisa lihat & insert
CREATE POLICY "koreksi_select" ON absen_koreksi_log FOR SELECT USING (
  absen_get_user_role() IN ('admin','hrd','manajemen')
  OR (absen_get_user_role() = 'atasan' AND karyawan_id IN (
    SELECT id FROM absen_karyawan WHERE atasan_id = auth.uid()
  ))
);
CREATE POLICY "koreksi_insert" ON absen_koreksi_log FOR INSERT WITH CHECK (absen_get_user_role() IN ('admin','atasan'));

-- Gaji: hanya admin dan hrd
CREATE POLICY "gaji_select" ON absen_gaji_bulanan FOR SELECT USING (absen_is_admin_or_hrd());
CREATE POLICY "gaji_all" ON absen_gaji_bulanan FOR ALL USING (absen_is_admin_or_hrd());

-- Audit log: admin/hrd/manajemen bisa lihat
CREATE POLICY "audit_select" ON absen_audit_log FOR SELECT USING (absen_get_user_role() IN ('admin','hrd','manajemen'));
CREATE POLICY "audit_insert" ON absen_audit_log FOR INSERT WITH CHECK (true);

-- ============================================================
-- 5. AUDIT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION absen_audit_trigger_fn()
RETURNS trigger AS $$
BEGIN
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

CREATE TRIGGER audit_karyawan AFTER INSERT OR UPDATE OR DELETE ON absen_karyawan
  FOR EACH ROW EXECUTE FUNCTION absen_audit_trigger_fn();

CREATE TRIGGER audit_harian AFTER INSERT OR UPDATE OR DELETE ON absen_harian
  FOR EACH ROW EXECUTE FUNCTION absen_audit_trigger_fn();

CREATE TRIGGER audit_konfigurasi AFTER INSERT OR UPDATE OR DELETE ON absen_konfigurasi
  FOR EACH ROW EXECUTE FUNCTION absen_audit_trigger_fn();

CREATE TRIGGER audit_periode AFTER INSERT OR UPDATE OR DELETE ON absen_periode_gaji
  FOR EACH ROW EXECUTE FUNCTION absen_audit_trigger_fn();

CREATE TRIGGER audit_gaji AFTER INSERT OR UPDATE OR DELETE ON absen_gaji_bulanan
  FOR EACH ROW EXECUTE FUNCTION absen_audit_trigger_fn();

-- updated_at auto-update
CREATE OR REPLACE FUNCTION absen_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_karyawan BEFORE UPDATE ON absen_karyawan
  FOR EACH ROW EXECUTE FUNCTION absen_set_updated_at();

CREATE TRIGGER set_updated_harian BEFORE UPDATE ON absen_harian
  FOR EACH ROW EXECUTE FUNCTION absen_set_updated_at();

CREATE TRIGGER set_updated_gaji BEFORE UPDATE ON absen_gaji_bulanan
  FOR EACH ROW EXECUTE FUNCTION absen_set_updated_at();

-- ============================================================
-- 6. RPC FUNCTIONS (Business Logic)
-- ============================================================

-- 6a. Import scans & process attendance
CREATE OR REPLACE FUNCTION absen_import_dan_proses(
  p_scans jsonb,
  p_nama_file text
)
RETURNS jsonb AS $$
DECLARE
  v_import_id uuid;
  v_tanggal_mulai date;
  v_tanggal_akhir date;
  v_jumlah_baris integer;
  v_uid_tidak_dikenal text[];
  v_cfg_dedup_menit integer;
  v_cfg_masuk_awal time;
  v_cfg_masuk_akhir time;
  v_cfg_pulang_mulai time;
  v_cfg_lembur_ambang time;
  v_cfg_lembur_mulai time;
  v_cfg_lembur_maks numeric;
  v_cfg_lembur_pembulatan integer;
  v_cfg_anomali_persen numeric;
  v_rec record;
  v_jam_masuk time;
  v_jam_pulang time;
  v_status text;
  v_jam_lembur numeric;
  v_status_lembur text;
  v_avg_lengkap numeric;
  v_count_lengkap integer;
  v_anomali_dates date[];
BEGIN
  v_jumlah_baris := jsonb_array_length(p_scans);

  -- Load config
  SELECT COALESCE((SELECT value::integer FROM absen_konfigurasi WHERE key = 'dedup_menit'), 3) INTO v_cfg_dedup_menit;
  SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'jam_masuk_awal'), '04:00') INTO v_cfg_masuk_awal;
  SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'jam_masuk_akhir'), '10:59') INTO v_cfg_masuk_akhir;
  SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'jam_pulang_mulai'), '14:30') INTO v_cfg_pulang_mulai;
  SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'lembur_ambang'), '18:30') INTO v_cfg_lembur_ambang;
  SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'lembur_mulai_hitung'), '19:00') INTO v_cfg_lembur_mulai;
  SELECT COALESCE((SELECT value::numeric FROM absen_konfigurasi WHERE key = 'lembur_maks_jam'), 4) INTO v_cfg_lembur_maks;
  SELECT COALESCE((SELECT value::integer FROM absen_konfigurasi WHERE key = 'lembur_pembulatan_menit'), 15) INTO v_cfg_lembur_pembulatan;
  SELECT COALESCE((SELECT value::numeric FROM absen_konfigurasi WHERE key = 'anomali_persen_ambang'), 50) INTO v_cfg_anomali_persen;

  -- Create import log
  v_import_id := gen_random_uuid();
  INSERT INTO absen_import_log (id, nama_file, jumlah_baris, diimport_oleh, status)
  VALUES (v_import_id, p_nama_file, v_jumlah_baris, auth.uid(), 'success');

  -- Insert raw scans
  INSERT INTO absen_scan_mentah (uid_mesin, timestamp_scan, data_mentah, import_id)
  SELECT
    s->>'uid',
    (s->>'timestamp')::timestamptz,
    s,
    v_import_id
  FROM jsonb_array_elements(p_scans) s;

  -- Resolve UID -> karyawan_id
  UPDATE absen_scan_mentah sm
  SET karyawan_id = k.id
  FROM absen_karyawan k
  WHERE sm.uid_mesin = ANY(k.uid_mesin)
    AND sm.import_id = v_import_id
    AND sm.karyawan_id IS NULL
    AND k.status_aktif = true;

  -- Collect unknown UIDs
  SELECT array_agg(DISTINCT uid_mesin)
  INTO v_uid_tidak_dikenal
  FROM absen_scan_mentah
  WHERE import_id = v_import_id AND karyawan_id IS NULL;

  -- Get date range
  SELECT MIN(timestamp_scan::date), MAX(timestamp_scan::date)
  INTO v_tanggal_mulai, v_tanggal_akhir
  FROM absen_scan_mentah WHERE import_id = v_import_id;

  -- Update import log
  UPDATE absen_import_log
  SET tanggal_mulai = v_tanggal_mulai,
      tanggal_akhir = v_tanggal_akhir,
      uid_tidak_dikenal = COALESCE(v_uid_tidak_dikenal, '{}')
  WHERE id = v_import_id;

  -- Mark duplicates (scans within dedup window of previous scan, same UID+date)
  WITH ordered_scans AS (
    SELECT id, uid_mesin, timestamp_scan,
      LAG(timestamp_scan) OVER (PARTITION BY uid_mesin, timestamp_scan::date ORDER BY timestamp_scan) AS prev_ts
    FROM absen_scan_mentah
    WHERE import_id = v_import_id AND karyawan_id IS NOT NULL
  )
  UPDATE absen_scan_mentah sm
  SET is_duplikat = true
  FROM ordered_scans os
  WHERE sm.id = os.id
    AND os.prev_ts IS NOT NULL
    AND EXTRACT(EPOCH FROM (os.timestamp_scan - os.prev_ts)) < (v_cfg_dedup_menit * 60);

  -- Process attendance per karyawan per tanggal
  FOR v_rec IN
    SELECT
      karyawan_id,
      timestamp_scan::date AS tanggal,
      MIN(CASE WHEN timestamp_scan::time BETWEEN v_cfg_masuk_awal AND v_cfg_masuk_akhir THEN timestamp_scan::time END) AS scan_masuk,
      MAX(CASE WHEN timestamp_scan::time >= v_cfg_pulang_mulai THEN timestamp_scan::time END) AS scan_pulang,
      bool_and(timestamp_scan::time > v_cfg_masuk_akhir AND timestamp_scan::time < v_cfg_pulang_mulai) AS hanya_tengah
    FROM absen_scan_mentah
    WHERE import_id = v_import_id
      AND karyawan_id IS NOT NULL
      AND is_duplikat = false
    GROUP BY karyawan_id, timestamp_scan::date
  LOOP
    v_jam_masuk := v_rec.scan_masuk;
    v_jam_pulang := v_rec.scan_pulang;
    v_jam_lembur := 0;
    v_status_lembur := NULL;

    -- Determine status
    IF v_rec.hanya_tengah AND v_jam_masuk IS NULL AND v_jam_pulang IS NULL THEN
      v_status := 'HANYA_SCAN_TENGAH';
    ELSIF v_jam_masuk IS NOT NULL AND v_jam_pulang IS NOT NULL THEN
      v_status := 'LENGKAP';
    ELSIF v_jam_masuk IS NOT NULL AND v_jam_pulang IS NULL THEN
      v_status := 'TANPA_PULANG';
    ELSIF v_jam_masuk IS NULL AND v_jam_pulang IS NOT NULL THEN
      v_status := 'TANPA_MASUK';
    ELSE
      v_status := 'HANYA_SCAN_TENGAH';
    END IF;

    -- Calculate overtime
    IF v_jam_pulang IS NOT NULL AND v_jam_pulang >= v_cfg_lembur_ambang THEN
      v_jam_lembur := EXTRACT(EPOCH FROM (v_jam_pulang - v_cfg_lembur_mulai)) / 3600.0;
      IF v_jam_lembur < 0 THEN v_jam_lembur := 0; END IF;
      -- Round down to nearest pembulatan interval
      v_jam_lembur := FLOOR(v_jam_lembur * 60 / v_cfg_lembur_pembulatan) * v_cfg_lembur_pembulatan / 60.0;
      IF v_jam_lembur > v_cfg_lembur_maks THEN v_jam_lembur := v_cfg_lembur_maks; END IF;
      IF v_jam_lembur > 0 THEN v_status_lembur := 'PENDING_APPROVAL'; END IF;
    END IF;

    -- Upsert attendance
    INSERT INTO absen_harian (karyawan_id, tanggal, jam_masuk, jam_pulang, status, jam_lembur, status_lembur, sumber, import_id)
    VALUES (v_rec.karyawan_id, v_rec.tanggal, v_jam_masuk, v_jam_pulang, v_status, v_jam_lembur, v_status_lembur, 'sistem', v_import_id)
    ON CONFLICT (karyawan_id, tanggal) DO UPDATE SET
      jam_masuk = EXCLUDED.jam_masuk,
      jam_pulang = EXCLUDED.jam_pulang,
      status = EXCLUDED.status,
      jam_lembur = EXCLUDED.jam_lembur,
      status_lembur = EXCLUDED.status_lembur,
      sumber = 'sistem',
      import_id = EXCLUDED.import_id,
      updated_at = now();
  END LOOP;

  -- Detect mass anomalies
  v_anomali_dates := '{}';
  FOR v_rec IN
    SELECT tanggal, COUNT(*) FILTER (WHERE status = 'LENGKAP') AS cnt_lengkap
    FROM absen_harian
    WHERE import_id = v_import_id
    GROUP BY tanggal
  LOOP
    SELECT AVG(day_count)
    INTO v_avg_lengkap
    FROM (
      SELECT COUNT(*) FILTER (WHERE status = 'LENGKAP') AS day_count
      FROM absen_harian
      WHERE tanggal BETWEEN (v_rec.tanggal - interval '10 days')::date AND (v_rec.tanggal - interval '1 day')::date
        AND tanggal NOT IN (SELECT tanggal FROM absen_kalender WHERE jenis_hari != 'kerja')
      GROUP BY tanggal
      ORDER BY tanggal DESC
      LIMIT 7
    ) sub;

    IF v_avg_lengkap IS NOT NULL AND v_avg_lengkap > 0
       AND v_rec.cnt_lengkap < (v_avg_lengkap * v_cfg_anomali_persen / 100) THEN
      v_anomali_dates := array_append(v_anomali_dates, v_rec.tanggal);
      UPDATE absen_harian SET is_insiden = true, status = 'INSIDEN'
      WHERE tanggal = v_rec.tanggal AND import_id = v_import_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'import_id', v_import_id,
    'jumlah_baris', v_jumlah_baris,
    'tanggal_mulai', v_tanggal_mulai,
    'tanggal_akhir', v_tanggal_akhir,
    'uid_tidak_dikenal', COALESCE(v_uid_tidak_dikenal, '{}'),
    'anomali_dates', v_anomali_dates
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6b. Koreksi absensi
CREATE OR REPLACE FUNCTION absen_koreksi_absensi(
  p_absensi_id uuid,
  p_jam_masuk time,
  p_jam_pulang time,
  p_alasan text
)
RETURNS jsonb AS $$
DECLARE
  v_old record;
  v_kuota_terpakai integer;
  v_kuota_maks integer;
  v_bulan integer;
  v_tahun integer;
  v_new_status text;
  v_jam_lembur numeric := 0;
  v_status_lembur text;
  v_cfg_lembur_ambang time;
  v_cfg_lembur_mulai time;
  v_cfg_lembur_maks numeric;
  v_cfg_lembur_pembulatan integer;
BEGIN
  IF p_alasan IS NULL OR trim(p_alasan) = '' THEN
    RAISE EXCEPTION 'Alasan koreksi wajib diisi';
  END IF;

  SELECT * INTO v_old FROM absen_harian WHERE id = p_absensi_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Data absensi tidak ditemukan'; END IF;

  -- Check periode
  v_bulan := EXTRACT(MONTH FROM v_old.tanggal);
  v_tahun := EXTRACT(YEAR FROM v_old.tanggal);
  IF EXISTS (SELECT 1 FROM absen_periode_gaji WHERE bulan = v_bulan AND tahun = v_tahun AND status = 'tutup') THEN
    RAISE EXCEPTION 'Periode sudah ditutup, tidak bisa dikoreksi';
  END IF;

  -- Check kuota
  SELECT COALESCE((SELECT value::integer FROM absen_konfigurasi WHERE key = 'kuota_koreksi'), 3) INTO v_kuota_maks;
  SELECT COUNT(*) INTO v_kuota_terpakai
  FROM absen_koreksi_log
  WHERE karyawan_id = v_old.karyawan_id
    AND EXTRACT(MONTH FROM tanggal) = v_bulan
    AND EXTRACT(YEAR FROM tanggal) = v_tahun;

  IF v_kuota_terpakai >= v_kuota_maks AND absen_get_user_role() NOT IN ('admin','hrd') THEN
    RAISE EXCEPTION 'Kuota koreksi karyawan ini sudah habis (% dari %)', v_kuota_terpakai, v_kuota_maks;
  END IF;

  -- Determine new status
  IF p_jam_masuk IS NOT NULL AND p_jam_pulang IS NOT NULL THEN
    v_new_status := 'LENGKAP';
  ELSIF p_jam_masuk IS NOT NULL THEN
    v_new_status := 'TANPA_PULANG';
  ELSIF p_jam_pulang IS NOT NULL THEN
    v_new_status := 'TANPA_MASUK';
  ELSE
    v_new_status := v_old.status;
  END IF;

  -- Calculate overtime for correction
  SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'lembur_ambang'), '18:30') INTO v_cfg_lembur_ambang;
  SELECT COALESCE((SELECT value::time FROM absen_konfigurasi WHERE key = 'lembur_mulai_hitung'), '19:00') INTO v_cfg_lembur_mulai;
  SELECT COALESCE((SELECT value::numeric FROM absen_konfigurasi WHERE key = 'lembur_maks_jam'), 4) INTO v_cfg_lembur_maks;
  SELECT COALESCE((SELECT value::integer FROM absen_konfigurasi WHERE key = 'lembur_pembulatan_menit'), 15) INTO v_cfg_lembur_pembulatan;

  v_status_lembur := NULL;
  IF p_jam_pulang IS NOT NULL AND p_jam_pulang >= v_cfg_lembur_ambang THEN
    v_jam_lembur := EXTRACT(EPOCH FROM (p_jam_pulang - v_cfg_lembur_mulai)) / 3600.0;
    IF v_jam_lembur < 0 THEN v_jam_lembur := 0; END IF;
    v_jam_lembur := FLOOR(v_jam_lembur * 60 / v_cfg_lembur_pembulatan) * v_cfg_lembur_pembulatan / 60.0;
    IF v_jam_lembur > v_cfg_lembur_maks THEN v_jam_lembur := v_cfg_lembur_maks; END IF;
    IF v_jam_lembur > 0 THEN v_status_lembur := 'PENDING_APPROVAL'; END IF;
  END IF;

  -- Log correction
  INSERT INTO absen_koreksi_log (absensi_id, karyawan_id, tanggal, jam_masuk_lama, jam_pulang_lama, status_lama, jam_masuk_baru, jam_pulang_baru, status_baru, alasan, dikoreksi_oleh)
  VALUES (p_absensi_id, v_old.karyawan_id, v_old.tanggal, v_old.jam_masuk, v_old.jam_pulang, v_old.status, p_jam_masuk, p_jam_pulang, v_new_status, p_alasan, auth.uid());

  -- Update attendance
  UPDATE absen_harian
  SET jam_masuk = p_jam_masuk,
      jam_pulang = p_jam_pulang,
      status = v_new_status,
      jam_lembur = v_jam_lembur,
      status_lembur = v_status_lembur,
      sumber = 'koreksi'
  WHERE id = p_absensi_id;

  RETURN jsonb_build_object('success', true, 'status_baru', v_new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6c. Approve/reject lembur
CREATE OR REPLACE FUNCTION absen_approve_lembur(
  p_absensi_id uuid,
  p_status text,
  p_catatan text DEFAULT NULL
)
RETURNS jsonb AS $$
BEGIN
  IF p_status NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'Status harus APPROVED atau REJECTED';
  END IF;
  IF p_status = 'REJECTED' AND (p_catatan IS NULL OR trim(p_catatan) = '') THEN
    RAISE EXCEPTION 'Catatan wajib diisi saat reject';
  END IF;

  UPDATE absen_harian
  SET status_lembur = p_status, catatan = p_catatan
  WHERE id = p_absensi_id AND status_lembur = 'PENDING_APPROVAL';

  IF NOT FOUND THEN RAISE EXCEPTION 'Data tidak ditemukan atau sudah diproses'; END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6d. Hitung gaji bulanan
CREATE OR REPLACE FUNCTION absen_hitung_gaji(p_bulan integer, p_tahun integer)
RETURNS jsonb AS $$
DECLARE
  v_hari_kerja_bulan integer;
  v_rec record;
  v_gaji_harian numeric;
  v_upah_lembur_perjam numeric;
  v_gaji_lembur numeric;
  v_total integer := 0;
BEGIN
  -- Count work days in month
  SELECT COUNT(*) INTO v_hari_kerja_bulan
  FROM absen_kalender
  WHERE EXTRACT(MONTH FROM tanggal) = p_bulan
    AND EXTRACT(YEAR FROM tanggal) = p_tahun
    AND jenis_hari = 'kerja';

  IF v_hari_kerja_bulan = 0 THEN
    v_hari_kerja_bulan := 26;
  END IF;

  -- Calculate for each active employee
  FOR v_rec IN
    SELECT
      k.id AS karyawan_id,
      k.gaji_bulanan,
      k.tunjangan,
      COUNT(ah.id) FILTER (WHERE ah.status = 'LENGKAP') AS hari_hadir,
      COALESCE(SUM(ah.jam_lembur) FILTER (WHERE ah.status_lembur = 'APPROVED'), 0) AS total_lembur
    FROM absen_karyawan k
    LEFT JOIN absen_harian ah ON ah.karyawan_id = k.id
      AND EXTRACT(MONTH FROM ah.tanggal) = p_bulan
      AND EXTRACT(YEAR FROM ah.tanggal) = p_tahun
    WHERE k.status_aktif = true
    GROUP BY k.id, k.gaji_bulanan, k.tunjangan
  LOOP
    v_gaji_harian := v_rec.gaji_bulanan / v_hari_kerja_bulan;
    v_upah_lembur_perjam := v_rec.gaji_bulanan / 173;

    -- Overtime: first hour 1.5x, rest 2.0x
    IF v_rec.total_lembur > 0 THEN
      IF v_rec.total_lembur <= 1 THEN
        v_gaji_lembur := v_rec.total_lembur * v_upah_lembur_perjam * 1.5;
      ELSE
        v_gaji_lembur := (1 * v_upah_lembur_perjam * 1.5) + ((v_rec.total_lembur - 1) * v_upah_lembur_perjam * 2.0);
      END IF;
    ELSE
      v_gaji_lembur := 0;
    END IF;

    INSERT INTO absen_gaji_bulanan (karyawan_id, bulan, tahun, hari_kerja, jam_lembur_total, gaji_pokok, gaji_lembur, tunjangan, potongan, total_gaji, status)
    VALUES (
      v_rec.karyawan_id, p_bulan, p_tahun,
      v_rec.hari_hadir,
      v_rec.total_lembur,
      v_rec.hari_hadir * v_gaji_harian,
      v_gaji_lembur,
      v_rec.tunjangan,
      0,
      (v_rec.hari_hadir * v_gaji_harian) + v_gaji_lembur + v_rec.tunjangan,
      'draft'
    )
    ON CONFLICT (karyawan_id, bulan, tahun) DO UPDATE SET
      hari_kerja = EXCLUDED.hari_kerja,
      jam_lembur_total = EXCLUDED.jam_lembur_total,
      gaji_pokok = EXCLUDED.gaji_pokok,
      gaji_lembur = EXCLUDED.gaji_lembur,
      tunjangan = EXCLUDED.tunjangan,
      total_gaji = EXCLUDED.total_gaji,
      status = 'draft',
      updated_at = now();

    v_total := v_total + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'jumlah_karyawan', v_total, 'hari_kerja_bulan', v_hari_kerja_bulan);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6e. Tutup periode
CREATE OR REPLACE FUNCTION absen_tutup_periode(p_bulan integer, p_tahun integer)
RETURNS jsonb AS $$
DECLARE
  v_belum_koreksi integer;
  v_lembur_pending integer;
BEGIN
  -- Check unresolved attendance
  SELECT COUNT(*) INTO v_belum_koreksi
  FROM absen_harian ah
  JOIN absen_karyawan k ON k.id = ah.karyawan_id AND k.status_aktif = true
  WHERE EXTRACT(MONTH FROM ah.tanggal) = p_bulan
    AND EXTRACT(YEAR FROM ah.tanggal) = p_tahun
    AND ah.status NOT IN ('LENGKAP','TIDAK_ADA_SCAN');

  IF v_belum_koreksi > 0 THEN
    RAISE EXCEPTION 'Masih ada % data absensi yang belum dikoreksi', v_belum_koreksi;
  END IF;

  -- Check pending overtime
  SELECT COUNT(*) INTO v_lembur_pending
  FROM absen_harian
  WHERE EXTRACT(MONTH FROM tanggal) = p_bulan
    AND EXTRACT(YEAR FROM tanggal) = p_tahun
    AND status_lembur = 'PENDING_APPROVAL';

  IF v_lembur_pending > 0 THEN
    RAISE EXCEPTION 'Masih ada % lembur yang belum di-approve', v_lembur_pending;
  END IF;

  -- Finalize salary
  UPDATE absen_gaji_bulanan SET status = 'final' WHERE bulan = p_bulan AND tahun = p_tahun;

  -- Close period
  INSERT INTO absen_periode_gaji (bulan, tahun, status, ditutup_oleh, ditutup_at)
  VALUES (p_bulan, p_tahun, 'tutup', auth.uid(), now())
  ON CONFLICT (bulan, tahun) DO UPDATE SET
    status = 'tutup',
    ditutup_oleh = auth.uid(),
    ditutup_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6f. Buka periode (emergency)
CREATE OR REPLACE FUNCTION absen_buka_periode(p_bulan integer, p_tahun integer, p_alasan text)
RETURNS jsonb AS $$
BEGIN
  IF absen_get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Hanya admin yang bisa membuka periode';
  END IF;
  IF p_alasan IS NULL OR trim(p_alasan) = '' THEN
    RAISE EXCEPTION 'Alasan pembukaan wajib diisi';
  END IF;

  UPDATE absen_periode_gaji
  SET status = 'buka', dibuka_oleh = auth.uid(), dibuka_at = now(), alasan_buka = p_alasan
  WHERE bulan = p_bulan AND tahun = p_tahun AND status = 'tutup';

  IF NOT FOUND THEN RAISE EXCEPTION 'Periode tidak ditemukan atau sudah terbuka'; END IF;

  UPDATE absen_gaji_bulanan SET status = 'draft' WHERE bulan = p_bulan AND tahun = p_tahun;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6g. Dashboard stats
CREATE OR REPLACE FUNCTION absen_dashboard_stats(p_bulan integer, p_tahun integer)
RETURNS jsonb AS $$
DECLARE
  v_total_karyawan integer;
  v_total_lengkap integer;
  v_total_perlu_koreksi integer;
  v_total_lembur_pending integer;
  v_total_insiden integer;
  v_hari_kerja integer;
BEGIN
  SELECT COUNT(*) INTO v_total_karyawan FROM absen_karyawan WHERE status_aktif = true;

  SELECT
    COUNT(*) FILTER (WHERE status = 'LENGKAP'),
    COUNT(*) FILTER (WHERE status IN ('TANPA_PULANG','TANPA_MASUK','HANYA_SCAN_TENGAH','INSIDEN')),
    COUNT(*) FILTER (WHERE status_lembur = 'PENDING_APPROVAL'),
    COUNT(*) FILTER (WHERE is_insiden = true)
  INTO v_total_lengkap, v_total_perlu_koreksi, v_total_lembur_pending, v_total_insiden
  FROM absen_harian ah
  JOIN absen_karyawan k ON k.id = ah.karyawan_id AND k.status_aktif = true
  WHERE EXTRACT(MONTH FROM ah.tanggal) = p_bulan
    AND EXTRACT(YEAR FROM ah.tanggal) = p_tahun;

  SELECT COUNT(*) INTO v_hari_kerja
  FROM absen_kalender
  WHERE EXTRACT(MONTH FROM tanggal) = p_bulan
    AND EXTRACT(YEAR FROM tanggal) = p_tahun
    AND jenis_hari = 'kerja';

  RETURN jsonb_build_object(
    'total_karyawan', v_total_karyawan,
    'hari_kerja', v_hari_kerja,
    'total_lengkap', v_total_lengkap,
    'total_perlu_koreksi', v_total_perlu_koreksi,
    'total_lembur_pending', v_total_lembur_pending,
    'total_insiden', v_total_insiden
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
