-- ============================================================
-- 040: Fitur Tutup Absen Bulanan & Approval Buka Lock (2 Hari Access Window)
--
-- Deskripsi:
--   - Tabel absen_tutup_bulan menyimpan status lock per bulan.
--   - Status: 'CLOSED', 'REQUESTED', 'UNLOCKED_TEMPORARY'.
--   - Jika diapprove oleh role 'manajemen', status menjadi 'UNLOCKED_TEMPORARY'
--     selama 2 HARI (48 Jam). Setelah 48 jam, otomatis kembali terkunci.
--   - Fungsi helper absen_is_bulan_closed(p_tanggal) memvalidasi status lock.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

CREATE TABLE IF NOT EXISTS absen_tutup_bulan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun integer NOT NULL,
  bulan integer NOT NULL CHECK (bulan BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'CLOSED' CHECK (status IN ('CLOSED', 'REQUESTED', 'UNLOCKED_TEMPORARY')),
  closed_at timestamptz DEFAULT now(),
  closed_by uuid REFERENCES absen_karyawan(id) ON DELETE SET NULL,
  request_by uuid REFERENCES absen_karyawan(id) ON DELETE SET NULL,
  request_at timestamptz,
  alasan_request text,
  approved_by uuid REFERENCES absen_karyawan(id) ON DELETE SET NULL,
  approved_at timestamptz,
  unlocked_until timestamptz,
  catatan_approval text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_tutup_bulan UNIQUE (tahun, bulan)
);

CREATE INDEX IF NOT EXISTS idx_tutup_bulan_lookup ON absen_tutup_bulan (tahun, bulan);

-- Fungsi Helper: Memeriksa apakah suatu tanggal berada pada bulan yang DITUTUP
CREATE OR REPLACE FUNCTION absen_is_bulan_closed(p_tanggal date)
RETURNS boolean AS $$
DECLARE
  v_tahun integer;
  v_bulan integer;
  v_rec record;
BEGIN
  v_tahun := EXTRACT(YEAR FROM p_tanggal)::integer;
  v_bulan := EXTRACT(MONTH FROM p_tanggal)::integer;

  SELECT * INTO v_rec FROM absen_tutup_bulan WHERE tahun = v_tahun AND bulan = v_bulan;

  IF v_rec IS NULL THEN
    -- Belum ada record tutup absen (Secara default belum ditutup)
    RETURN false;
  END IF;

  IF v_rec.status = 'UNLOCKED_TEMPORARY' THEN
    -- Cek apakah masa berlaku 2 hari (unlocked_until) masih aktif
    IF v_rec.unlocked_until IS NOT NULL AND now() <= v_rec.unlocked_until THEN
      RETURN false; -- Masih dalam window 2 hari, BOLEH EDIT
    ELSE
      -- Sudah lebih dari 2 hari, OTOMATIS TERKUNCI KEMBALI
      RETURN true;
    END IF;
  END IF;

  -- Status 'CLOSED' atau 'REQUESTED' -> TERKUNCI
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Tutup Absen Bulan tertentu
CREATE OR REPLACE FUNCTION absen_lock_bulan(
  p_tahun integer,
  p_bulan integer,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
BEGIN
  INSERT INTO absen_tutup_bulan (tahun, bulan, status, closed_at, closed_by, updated_at)
  VALUES (p_tahun, p_bulan, 'CLOSED', now(), p_user_id, now())
  ON CONFLICT (tahun, bulan) DO UPDATE SET
    status = 'CLOSED',
    closed_at = now(),
    closed_by = COALESCE(p_user_id, absen_tutup_bulan.closed_by),
    unlocked_until = NULL,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'message', 'Absen bulan berhasil ditutup.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Pengajuan Permintaan Buka Lock Tutup Absen
CREATE OR REPLACE FUNCTION absen_request_buka_tutup_bulan(
  p_tahun integer,
  p_bulan integer,
  p_alasan text,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
BEGIN
  IF p_alasan IS NULL OR trim(p_alasan) = '' THEN
    RAISE EXCEPTION 'Alasan pembukaan lock wajib diisi';
  END IF;

  INSERT INTO absen_tutup_bulan (tahun, bulan, status, request_by, request_at, alasan_request, updated_at)
  VALUES (p_tahun, p_bulan, 'REQUESTED', p_user_id, now(), p_alasan, now())
  ON CONFLICT (tahun, bulan) DO UPDATE SET
    status = 'REQUESTED',
    request_by = COALESCE(p_user_id, absen_tutup_bulan.request_by),
    request_at = now(),
    alasan_request = p_alasan,
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'message', 'Permintaan buka lock berhasil dikirim ke Manajemen.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Approval / Reject Permintaan Buka Lock (Oleh Role Management)
CREATE OR REPLACE FUNCTION absen_approve_buka_tutup_bulan(
  p_tahun integer,
  p_bulan integer,
  p_action text, -- 'APPROVE' atau 'REJECT'
  p_catatan text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_unlocked_until timestamptz;
BEGIN
  IF p_action NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'Aksi harus APPROVE atau REJECT';
  END IF;

  IF p_action = 'APPROVE' THEN
    -- Set berlaku 2 HARI (48 JAM) dari sekarang
    v_unlocked_until := now() + interval '2 days';

    UPDATE absen_tutup_bulan
    SET status = 'UNLOCKED_TEMPORARY',
        approved_by = p_user_id,
        approved_at = now(),
        unlocked_until = v_unlocked_until,
        catatan_approval = p_catatan,
        updated_at = now()
    WHERE tahun = p_tahun AND bulan = p_bulan;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'UNLOCKED_TEMPORARY',
      'unlocked_until', v_unlocked_until,
      'message', 'Permintaan disetujui. Akses edit terbuka selama 2 hari (hingga ' || to_char(v_unlocked_until, 'YYYY-MM-DD HH24:MI') || ').'
    );
  ELSE
    UPDATE absen_tutup_bulan
    SET status = 'CLOSED',
        approved_by = p_user_id,
        approved_at = now(),
        catatan_approval = p_catatan,
        unlocked_until = NULL,
        updated_at = now()
    WHERE tahun = p_tahun AND bulan = p_bulan;

    RETURN jsonb_build_object('success', true, 'status', 'CLOSED', 'message', 'Permintaan buka lock ditolak.');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Integrate Tutup Absen validation into absen_catat_scan_wajah
DROP FUNCTION IF EXISTS absen_catat_scan_wajah(uuid, integer, text, text, text, text, numeric, numeric, numeric, text, boolean, numeric, integer, text);

CREATE OR REPLACE FUNCTION absen_catat_scan_wajah(
  p_karyawan_id uuid,
  p_slot_id integer,
  p_lokasi_kerja text DEFAULT NULL,
  p_jenis_pekerjaan text DEFAULT NULL,
  p_keterangan text DEFAULT NULL,
  p_foto_url text DEFAULT NULL,
  p_gps_lat numeric DEFAULT NULL,
  p_gps_lng numeric DEFAULT NULL,
  p_confidence numeric DEFAULT NULL,
  p_client_tz text DEFAULT NULL,
  p_is_mock_gps boolean DEFAULT false,
  p_gps_accuracy numeric DEFAULT NULL,
  p_fake_gps_score integer DEFAULT 0,
  p_fake_gps_reason text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_slot record;
  v_now timestamptz;
  v_now_time time;
  v_tanggal date;
  v_scan_id uuid;
  v_project_tz text;
  v_check_tz text;
  v_offsite boolean;
  v_final_mock boolean;
  v_deadline_time time;
BEGIN
  SELECT COALESCE(
    (SELECT value FROM absen_konfigurasi WHERE key = 'zona_waktu'),
    'Asia/Jayapura'
  ) INTO v_project_tz;

  v_check_tz := COALESCE(NULLIF(p_client_tz, ''), v_project_tz);
  v_offsite := (v_check_tz IS DISTINCT FROM v_project_tz);
  v_final_mock := COALESCE(p_is_mock_gps, false) OR (COALESCE(p_fake_gps_score, 0) >= 50);

  v_now := now();
  v_now_time := (v_now AT TIME ZONE v_check_tz)::time;
  v_tanggal := (v_now AT TIME ZONE v_check_tz)::date;

  -- 1. Pengujian Tutup Absen Bulanan
  IF absen_is_bulan_closed(v_tanggal) THEN
    RETURN jsonb_build_object('error', 'Absensi untuk bulan ini telah DITUTUP. Silakan ajukan pembukaan lock kepada Manajemen.');
  END IF;

  SELECT * INTO v_slot FROM absen_jadwal_slot WHERE id = p_slot_id AND aktif = true;
  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('error', 'Slot tidak ditemukan');
  END IF;

  -- 2. Pengujian Jendela Waktu Absen
  IF v_slot.jenis = 'pulang_lembur' THEN
    v_deadline_time := (v_slot.jam + (v_slot.toleransi_menit || ' minutes')::interval)::time;
    IF v_now_time > v_deadline_time AND v_now_time < '17:00:00'::time THEN
      RETURN jsonb_build_object(
        'error', 'Melampaui batas maksimal waktu pulang lembur',
        'jam_slot', v_slot.jam,
        'batas_maksimal', v_deadline_time,
        'waktu_sekarang', v_now_time,
        'timezone', v_check_tz
      );
    END IF;
  ELSE
    IF v_now_time < (v_slot.jam - (v_slot.toleransi_menit || ' minutes')::interval)
       OR v_now_time > (v_slot.jam + (v_slot.toleransi_menit || ' minutes')::interval) THEN
      RETURN jsonb_build_object(
        'error', 'Di luar jendela waktu',
        'jam_slot', v_slot.jam,
        'toleransi', v_slot.toleransi_menit,
        'waktu_sekarang', v_now_time,
        'timezone', v_check_tz
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM absen_scan_wajah
    WHERE karyawan_id = p_karyawan_id AND slot_id = p_slot_id AND tanggal = v_tanggal
  ) THEN
    RETURN jsonb_build_object('error', 'Sudah absen untuk slot ini hari ini');
  END IF;

  v_scan_id := gen_random_uuid();
  INSERT INTO absen_scan_wajah (
    id, karyawan_id, slot_id, tanggal, waktu_scan,
    lokasi_kerja, jenis_pekerjaan, keterangan, foto_url,
    gps_lat, gps_lng, confidence, di_luar_lokasi, client_tz,
    is_mock_gps, gps_accuracy, fake_gps_score, fake_gps_reason
  ) VALUES (
    v_scan_id, p_karyawan_id, p_slot_id, v_tanggal, v_now,
    p_lokasi_kerja, p_jenis_pekerjaan, p_keterangan, p_foto_url,
    p_gps_lat, p_gps_lng, p_confidence, v_offsite, v_check_tz,
    v_final_mock, p_gps_accuracy, COALESCE(p_fake_gps_score, 0), p_fake_gps_reason
  );

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
    'slot_label', v_slot.label,
    'di_luar_lokasi', v_offsite,
    'is_mock_gps', v_final_mock,
    'fake_gps_score', COALESCE(p_fake_gps_score, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
