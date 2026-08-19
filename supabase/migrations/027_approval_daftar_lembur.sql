-- ============================================================
-- 027: Approval Daftar Lembur + Email Notifikasi via Brevo
--
-- 1. Tambah kolom status & approval ke absen_daftar_lembur
-- 2. Update RPC untuk cek status APPROVED
-- 3. Tambah RPC approve/reject daftar lembur
-- 4. Tambah fungsi kirim email via Brevo (pg_net)
-- 5. Tambah konfigurasi email
--
-- JALANKAN DI SUPABASE SQL EDITOR SETELAH 026
-- ============================================================

-- 1. Enable pg_net for HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Add approval columns to daftar lembur
ALTER TABLE absen_daftar_lembur
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES absen_user_profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS catatan_approval text;

ALTER TABLE absen_daftar_lembur
  DROP CONSTRAINT IF EXISTS chk_daftar_lembur_status;
ALTER TABLE absen_daftar_lembur
  ADD CONSTRAINT chk_daftar_lembur_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'));

-- 3. Email notification function via Render webhook
-- Sends structured data to the Render API service which holds the Brevo API key.
-- No credentials stored in the database.
CREATE OR REPLACE FUNCTION absen_kirim_notif_lembur(
  p_tanggal date,
  p_karyawan_ids uuid[],
  p_created_by_nama text DEFAULT 'Admin'
)
RETURNS void AS $$
DECLARE
  v_webhook_url text;
  v_sender_name text;
  v_sender_email text;
  v_app_url text;
  v_to jsonb := '[]'::jsonb;
  v_karyawan jsonb := '[]'::jsonb;
  v_rec record;
  v_tgl_label text;
BEGIN
  SELECT value INTO v_webhook_url FROM absen_konfigurasi WHERE key = 'email_webhook_url';
  IF v_webhook_url IS NULL OR v_webhook_url = '' THEN RETURN; END IF;

  SELECT COALESCE((SELECT value FROM absen_konfigurasi WHERE key = 'email_sender_name'), 'SI WAJAH') INTO v_sender_name;
  SELECT COALESCE((SELECT value FROM absen_konfigurasi WHERE key = 'email_sender_email'), '') INTO v_sender_email;
  SELECT COALESCE((SELECT value FROM absen_konfigurasi WHERE key = 'app_url'), '') INTO v_app_url;

  -- Build employee list
  FOR v_rec IN
    SELECT k.nama, COALESCE(k.jabatan, '-') AS jabatan,
           COALESCE(m.nama, '-') AS mandor_nama
    FROM absen_karyawan k
    LEFT JOIN absen_karyawan m ON k.atasan_id = m.id
    WHERE k.id = ANY(p_karyawan_ids)
    ORDER BY m.nama NULLS LAST, k.nama
  LOOP
    v_karyawan := v_karyawan || jsonb_build_object(
      'nama', v_rec.nama,
      'jabatan', v_rec.jabatan,
      'mandor', v_rec.mandor_nama
    );
  END LOOP;

  -- Build recipient list (admin + manajemen)
  FOR v_rec IN
    SELECT au.email, up.nama
    FROM absen_user_profiles up
    JOIN auth.users au ON au.id = up.id
    WHERE up.role IN ('admin', 'manajemen')
      AND au.email IS NOT NULL
      AND au.email != ''
  LOOP
    v_to := v_to || jsonb_build_object('email', v_rec.email, 'name', COALESCE(v_rec.nama, ''));
  END LOOP;

  IF jsonb_array_length(v_to) = 0 THEN RETURN; END IF;

  v_tgl_label := to_char(p_tanggal, 'DD/MM/YYYY');

  -- POST to Render webhook — no credentials in this payload
  PERFORM net.http_post(
    url := v_webhook_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'to', v_to,
      'tanggal', v_tgl_label,
      'karyawan', v_karyawan,
      'created_by', p_created_by_nama,
      'sender_name', v_sender_name,
      'sender_email', v_sender_email,
      'app_url', v_app_url
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update daftarkan lembur to auto-send email
CREATE OR REPLACE FUNCTION absen_daftarkan_lembur(
  p_tanggal date,
  p_karyawan_ids uuid[],
  p_catatan text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_kid uuid;
  v_count integer := 0;
  v_creator_nama text;
BEGIN
  FOREACH v_kid IN ARRAY p_karyawan_ids
  LOOP
    INSERT INTO absen_daftar_lembur (tanggal, karyawan_id, catatan, created_by, status)
    VALUES (p_tanggal, v_kid, p_catatan, p_user_id, 'PENDING')
    ON CONFLICT (tanggal, karyawan_id) DO NOTHING;
    v_count := v_count + 1;
  END LOOP;

  -- Send email notification
  BEGIN
    SELECT COALESCE(nama, 'Admin') INTO v_creator_nama
    FROM absen_user_profiles WHERE id = p_user_id;

    PERFORM absen_kirim_notif_lembur(p_tanggal, p_karyawan_ids, COALESCE(v_creator_nama, 'Admin'));
  EXCEPTION WHEN OTHERS THEN
    -- Don't fail the main operation if email fails
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Approve/reject daftar lembur (for manajemen/admin)
CREATE OR REPLACE FUNCTION absen_approve_daftar_lembur(
  p_ids uuid[],
  p_status text,
  p_catatan text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  IF p_status NOT IN ('APPROVED', 'REJECTED') THEN
    RETURN jsonb_build_object('error', 'Status tidak valid');
  END IF;

  FOREACH v_id IN ARRAY p_ids
  LOOP
    UPDATE absen_daftar_lembur
    SET status = p_status,
        approved_by = p_user_id,
        approved_at = now(),
        catatan_approval = p_catatan
    WHERE id = v_id AND status = 'PENDING';

    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Update hapus daftar lembur — approved items need admin role
CREATE OR REPLACE FUNCTION absen_hapus_daftar_lembur(p_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_record record;
  v_user_role text;
BEGIN
  SELECT * INTO v_record FROM absen_daftar_lembur WHERE id = p_id;
  IF v_record IS NULL THEN
    RETURN jsonb_build_object('error', 'Data tidak ditemukan');
  END IF;

  IF v_record.status = 'APPROVED' THEN
    SELECT role INTO v_user_role FROM absen_user_profiles WHERE id = auth.uid();
    IF v_user_role IS DISTINCT FROM 'admin' THEN
      RETURN jsonb_build_object('error', 'Hanya admin yang dapat menghapus data lembur yang sudah diapprove');
    END IF;
  END IF;

  DELETE FROM absen_daftar_lembur WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Update cek lembur — only APPROVED counts
CREATE OR REPLACE FUNCTION absen_cek_lembur_hari_ini(p_karyawan_id uuid)
RETURNS boolean AS $$
DECLARE
  v_tz text;
  v_today date;
BEGIN
  SELECT COALESCE(
    (SELECT value FROM absen_konfigurasi WHERE key = 'zona_waktu'),
    'Asia/Jayapura'
  ) INTO v_tz;
  v_today := (now() AT TIME ZONE v_tz)::date;

  RETURN EXISTS (
    SELECT 1 FROM absen_daftar_lembur
    WHERE karyawan_id = p_karyawan_id AND tanggal = v_today AND status = 'APPROVED'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Update scan wajah — only APPROVED lembur can scan
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
  p_waktu_scan timestamptz DEFAULT NULL
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
  v_is_offline boolean;
BEGIN
  SELECT COALESCE(
    (SELECT value FROM absen_konfigurasi WHERE key = 'zona_waktu'),
    'Asia/Jayapura'
  ) INTO v_project_tz;

  v_check_tz := COALESCE(NULLIF(p_client_tz, ''), v_project_tz);
  v_offsite := (v_check_tz IS DISTINCT FROM v_project_tz);

  v_is_offline := (p_waktu_scan IS NOT NULL);
  v_now := COALESCE(p_waktu_scan, now());
  v_now_time := (v_now AT TIME ZONE v_check_tz)::time;
  v_tanggal := (v_now AT TIME ZONE v_check_tz)::date;

  SELECT * INTO v_slot FROM absen_jadwal_slot WHERE id = p_slot_id AND aktif = true;
  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('error', 'Slot tidak ditemukan');
  END IF;

  -- Check lembur registration (APPROVED only)
  IF v_slot.jenis IN ('lembur', 'pulang_lembur') THEN
    IF NOT EXISTS (
      SELECT 1 FROM absen_daftar_lembur
      WHERE karyawan_id = p_karyawan_id AND tanggal = v_tanggal AND status = 'APPROVED'
    ) THEN
      RETURN jsonb_build_object('error', 'Anda tidak terdaftar lembur hari ini');
    END IF;
  END IF;

  -- Skip time window check for offline sync
  IF NOT v_is_offline THEN
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
    gps_lat, gps_lng, confidence, di_luar_lokasi, client_tz
  ) VALUES (
    v_scan_id, p_karyawan_id, p_slot_id, v_tanggal, v_now,
    p_lokasi_kerja, p_jenis_pekerjaan, p_keterangan, p_foto_url,
    p_gps_lat, p_gps_lng, p_confidence, v_offsite, v_check_tz
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
    'di_luar_lokasi', v_offsite
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Default email config (no credentials — API key lives on Render)
INSERT INTO absen_konfigurasi (key, value, deskripsi) VALUES
  ('email_webhook_url', '', 'URL endpoint Render untuk pengiriman email (contoh: https://siwajah-api.onrender.com/api/notify-lembur)'),
  ('email_sender_name', 'SI WAJAH', 'Nama pengirim email notifikasi'),
  ('email_sender_email', '', 'Email pengirim (harus terverifikasi di Brevo)'),
  ('app_url', '', 'URL aplikasi SI WAJAH (untuk link di email)')
ON CONFLICT (key) DO NOTHING;
