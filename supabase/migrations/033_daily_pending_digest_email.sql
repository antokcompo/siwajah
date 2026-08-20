-- ============================================================
-- 033: Daily Pending Approval Digest Email (Setiap Hari Pukul 19.00)
--
-- 1. Mengirim notifikasi email otomatis ke Admin & Manajemen pukul 19:00
--    apabila terdapat Laporan Terlewat (PENDING) atau Izin Pekerja (PENDING / CANCEL_REQUESTED).
-- 2. Email TIDAK AKAN TERKIRIM jika tidak ada item yang berstatus pending.
-- 3. Payload menyertakan HTML lengkap & subject sehingga webhook Brevo/Render dapat langsung mengirimkannya.
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
  v_subject text;
  v_html text;
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

  -- 6. Buat Subject & HTML Email Template Profesional
  v_subject := '[SI WAJAH] Pengingat Approval: ' || v_total_pending || ' Item Pending (19.00)';

  v_html := '<!DOCTYPE html><html><head><meta charset="utf-8">'
    || '<style>body{font-family:sans-serif;background-color:#0f172a;color:#e2e8f0;margin:0;padding:20px;}'
    || '.container{max-width:600px;margin:0 auto;background-color:#1e293b;border-radius:16px;padding:24px;border:1px solid #334155;}'
    || '.header{background:linear-gradient(135deg,#0284c7,#0f766e);padding:20px;border-radius:12px;text-align:center;margin-bottom:20px;}'
    || '.header h2{color:#fff;margin:0;font-size:18px;}.header p{color:#e0f2fe;margin:4px 0 0 0;font-size:12px;}'
    || '.alert{background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:14px;text-align:center;margin-bottom:20px;}'
    || '.alert h4{color:#fbbf24;margin:0 0 4px 0;font-size:14px;}.alert p{color:#fef3c7;margin:0;font-size:12px;}'
    || 'table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px;}'
    || 'th{background:#0f172a;color:#94a3b8;text-align:left;padding:8px 10px;border-bottom:1px solid #334155;}'
    || 'td{padding:8px 10px;border-bottom:1px solid #334155;color:#cbd5e1;}'
    || '.btn{background:linear-gradient(135deg,#0284c7,#2563eb);color:#fff!important;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold;font-size:13px;display:inline-block;}'
    || '</style></head><body>'
    || '<div class="container">'
    || '<div class="header"><h2>SI WAJAH — Daily Pending Approval Digest</h2><p>Pengingat Approval Pukul 19.00 WIT</p></div>'
    || '<div class="alert"><h4>⚠️ ' || v_total_pending || ' Pengajuan Menunggu Persetujuan Anda</h4>'
    || '<p>Terdapat ' || v_count_laporan || ' Laporan Terlewat dan ' || v_count_izin || ' Pengajuan Izin yang belum diproses.</p></div>';

  IF v_count_laporan > 0 THEN
    v_html := v_html || '<h4 style="color:#38bdf8;margin:16px 0 8px 0;">📋 LAPORAN TERLEWAT (' || v_count_laporan || ' Item)</h4>'
      || '<table><thead><tr><th>Karyawan</th><th>Tanggal & Slot</th><th>Alasan</th></tr></thead><tbody>';
    FOR v_rec IN
      SELECT l.tanggal, l.alasan, k.nama, k.jabatan, s.label AS slot_label
      FROM absen_laporan_terlewat l
      JOIN absen_karyawan k ON k.id = l.karyawan_id
      LEFT JOIN absen_jadwal_slot s ON s.id = l.slot_id
      WHERE l.status = 'PENDING'
      ORDER BY l.tanggal DESC
    LOOP
      v_html := v_html || '<tr><td><strong>' || v_rec.nama || '</strong><br><span style="color:#94a3b8;font-size:10px;">' || COALESCE(v_rec.jabatan,'-') || '</span></td>'
        || '<td>' || to_char(v_rec.tanggal, 'DD/MM/YYYY') || '<br><span style="color:#38bdf8;font-size:10px;">' || COALESCE(v_rec.slot_label,'-') || '</span></td>'
        || '<td>' || v_rec.alasan || '</td></tr>';
    END LOOP;
    v_html := v_html || '</tbody></table>';
  END IF;

  IF v_count_izin > 0 THEN
    v_html := v_html || '<h4 style="color:#38bdf8;margin:16px 0 8px 0;">📅 PENGAJUAN IZIN & PEMBATALAN (' || v_count_izin || ' Item)</h4>'
      || '<table><thead><tr><th>Karyawan</th><th>Tipe & Tanggal</th><th>Alasan</th></tr></thead><tbody>';
    FOR v_rec IN
      SELECT i.tanggal_mulai, i.tanggal_selesai, i.jenis, i.alasan, i.status, i.alasan_batal, k.nama, k.jabatan
      FROM absen_izin i
      JOIN absen_karyawan k ON k.id = i.karyawan_id
      WHERE i.status IN ('PENDING', 'CANCEL_REQUESTED')
      ORDER BY i.created_at DESC
    LOOP
      v_html := v_html || '<tr><td><strong>' || v_rec.nama || '</strong><br><span style="color:#94a3b8;font-size:10px;">' || COALESCE(v_rec.jabatan,'-') || '</span></td>'
        || '<td><strong>' || CASE WHEN v_rec.status = 'CANCEL_REQUESTED' THEN 'Batal Izin' ELSE 'Izin Baru' END || '</strong><br>' || to_char(v_rec.tanggal_mulai, 'DD/MM/YYYY') || '</td>'
        || '<td>' || CASE WHEN v_rec.status = 'CANCEL_REQUESTED' THEN COALESCE(v_rec.alasan_batal, v_rec.alasan) ELSE v_rec.alasan END || '</td></tr>';
    END LOOP;
    v_html := v_html || '</tbody></table>';
  END IF;

  v_html := v_html || '<div style="text-align:center;margin-top:24px;"><a href="' || v_app_url || '/laporan-izin" class="btn">Buka Portal Approval Admin ➔</a></div>'
    || '<div style="text-align:center;margin-top:20px;font-size:11px;color:#64748b;">Email otomatis dikirim oleh SI WAJAH setiap pukul 19.00 WIT.</div>'
    || '</div></body></html>';

  -- 7. Trigger HTTP POST Webhook via pg_net (Payload Digest + Full HTML)
  PERFORM net.http_post(
    url := v_webhook_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'type', 'pending_digest',
      'subject', v_subject,
      'html', v_html,
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

-- 8. Jadwalkan pg_cron Otomatis Setiap Hari Pukul 19.00 WIT (10.00 UTC)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
  'daily-pending-approval-digest',
  '0 10 * * *',
  $$SELECT absen_kirim_digest_pending_approval()$$
);
