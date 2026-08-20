-- ============================================================
-- 033: Daily Pending Approval Digest Email (Setiap Hari Pukul 19.00)
--
-- 1. Mengirim notifikasi email otomatis ke Admin & Manajemen pukul 19:00
--    apabila terdapat Laporan Terlewat (PENDING) atau Izin Pekerja (PENDING / CANCEL_REQUESTED).
-- 2. Email TIDAK AKAN TERKIRIM jika tidak ada item yang berstatus pending.
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

CREATE OR REPLACE FUNCTION absen_kirim_digest_pending_approval()
RETURNS jsonb AS $$
DECLARE
  v_webhook_url text;
  v_sender_name text;
  v_sender_email text;
  v_app_url text;
  v_to jsonb := '[]'::jsonb;
  v_list_laporan jsonb := '[]'::jsonb;
  v_list_izin jsonb := '[]'::jsonb;
  v_rec record;
  v_count_laporan integer := 0;
  v_count_izin integer := 0;
  v_total_pending integer := 0;
BEGIN
  -- 1. Ambil Konfigurasi Email Webhook
  SELECT value INTO v_webhook_url FROM absen_konfigurasi WHERE key = 'email_webhook_url';
  IF v_webhook_url IS NULL OR v_webhook_url = '' THEN
    RETURN jsonb_build_object('sent', false, 'reason', 'email_webhook_url belum dikonfigurasi');
  END IF;

  SELECT COALESCE((SELECT value FROM absen_konfigurasi WHERE key = 'email_sender_name'), 'SI WAJAH') INTO v_sender_name;
  SELECT COALESCE((SELECT value FROM absen_konfigurasi WHERE key = 'email_sender_email'), '') INTO v_sender_email;
  SELECT COALESCE((SELECT value FROM absen_konfigurasi WHERE key = 'app_url'), 'https://siwajah.pages.dev') INTO v_app_url;

  -- 2. Ambil List Laporan Terlewat Berstatus PENDING
  FOR v_rec IN
    SELECT l.id, l.tanggal, l.alasan, l.created_at,
           k.nama AS karyawan_nama, COALESCE(k.jabatan, '-') AS jabatan,
           s.label AS slot_label, s.jam AS slot_jam
    FROM absen_laporan_terlewat l
    JOIN absen_karyawan k ON k.id = l.karyawan_id
    LEFT JOIN absen_jadwal_slot s ON s.id = l.slot_id
    WHERE l.status = 'PENDING'
    ORDER BY l.tanggal DESC, l.created_at DESC
  LOOP
    v_count_laporan := v_count_laporan + 1;
    v_list_laporan := v_list_laporan || jsonb_build_object(
      'nama', v_rec.karyawan_nama,
      'jabatan', v_rec.jabatan,
      'tanggal', to_char(v_rec.tanggal, 'DD/MM/YYYY'),
      'slot_label', COALESCE(v_rec.slot_label, '-'),
      'slot_jam', COALESCE(to_char(v_rec.slot_jam, 'HH24:MI'), '-'),
      'alasan', v_rec.alasan
    );
  END LOOP;

  -- 3. Ambil List Pengajuan Izin Berstatus PENDING atau CANCEL_REQUESTED
  FOR v_rec IN
    SELECT i.id, i.tanggal_mulai, i.tanggal_selesai, i.jenis, i.alasan, i.status, i.alasan_batal,
           k.nama AS karyawan_nama, COALESCE(k.jabatan, '-') AS jabatan
    FROM absen_izin i
    JOIN absen_karyawan k ON k.id = i.karyawan_id
    WHERE i.status IN ('PENDING', 'CANCEL_REQUESTED')
    ORDER BY i.created_at DESC
  LOOP
    v_count_izin := v_count_izin + 1;
    v_list_izin := v_list_izin || jsonb_build_object(
      'nama', v_rec.karyawan_nama,
      'jabatan', v_rec.jabatan,
      'status', v_rec.status,
      'tipe_label', CASE WHEN v_rec.status = 'CANCEL_REQUESTED' THEN 'Pengajuan Batal Izin' ELSE 'Izin Baru' END,
      'tanggal_mulai', to_char(v_rec.tanggal_mulai, 'DD/MM/YYYY'),
      'tanggal_selesai', to_char(v_rec.tanggal_selesai, 'DD/MM/YYYY'),
      'jenis_label', CASE WHEN v_rec.jenis = 'PAID' THEN 'Berbayar' ELSE 'Tidak Berbayar' END,
      'alasan', CASE WHEN v_rec.status = 'CANCEL_REQUESTED' THEN COALESCE(v_rec.alasan_batal, v_rec.alasan) ELSE v_rec.alasan END
    );
  END LOOP;

  v_total_pending := v_count_laporan + v_count_izin;

  -- 4. ATURAN UTAMA: Jika TIDAK ADA yang pending, JANGAN KIRIM EMAIL
  IF v_total_pending = 0 THEN
    RETURN jsonb_build_object('sent', false, 'reason', 'Tidak ada laporan terlewat atau izin yang statusnya pending');
  END IF;

  -- 5. Ambil Daftar Penerima Email (Admin & Manajemen)
  FOR v_rec IN
    SELECT au.email, up.nama
    FROM absen_user_profiles up
    JOIN auth.users au ON au.id = up.id
    WHERE up.role IN ('admin', 'manajemen')
      AND au.email IS NOT NULL
      AND au.email != ''
  LOOP
    v_to := v_to || jsonb_build_object('email', v_rec.email, 'name', COALESCE(v_rec.nama, 'Admin'));
  END LOOP;

  IF jsonb_array_length(v_to) = 0 THEN
    RETURN jsonb_build_object('sent', false, 'reason', 'Tidak ada email Admin/Manajemen yang ditemukan');
  END IF;

  -- 6. Trigger HTTP POST Webhook via pg_net (Payload Digest)
  PERFORM net.http_post(
    url := v_webhook_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'type', 'pending_digest',
      'to', v_to,
      'total_pending', v_total_pending,
      'count_laporan', v_count_laporan,
      'count_izin', v_count_izin,
      'list_laporan', v_list_laporan,
      'list_izin', v_list_izin,
      'sender_name', v_sender_name,
      'sender_email', v_sender_email,
      'app_url', v_app_url || '/laporan-izin'
    )
  );

  RETURN jsonb_build_object(
    'sent', true,
    'recipients_count', jsonb_array_length(v_to),
    'total_pending', v_total_pending,
    'count_laporan', v_count_laporan,
    'count_izin', v_count_izin
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Jadwalkan pg_cron Otomatis Setiap Hari Pukul 19.00 WIT (10.00 UTC)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
  'daily-pending-approval-digest',
  '0 10 * * *',
  $$SELECT absen_kirim_digest_pending_approval()$$
);
