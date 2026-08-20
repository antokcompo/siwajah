-- ============================================================
-- 033: Daily Pending Approval Digest Email (Setiap Hari Pukul 19.00)
--
-- 1. Mengirim notifikasi email otomatis ke Admin & Manajemen pukul 19:00
--    apabila terdapat Laporan Terlewat (PENDING) atau Izin Pekerja (PENDING / CANCEL_REQUESTED).
-- 2. Email TIDAK AKAN TERKIRIM jika tidak ada item yang berstatus pending.
-- 3. Menggunakan API Key Brevo Langsung (Arsitektur SIMONIKA - Tanpa Webhook)
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

CREATE OR REPLACE FUNCTION absen_kirim_digest_pending_approval()
RETURNS jsonb AS $$
DECLARE
  v_brevo_api_key text;
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
  v_found_sender bool := false;
BEGIN
  -- 1. Ambil API Key Brevo & Konfigurasi dari Tabel absen_konfigurasi (Arsitektur SIMONIKA)
  SELECT value INTO v_brevo_api_key FROM absen_konfigurasi WHERE key = 'brevo_api_key';
  SELECT COALESCE(NULLIF((SELECT value FROM absen_konfigurasi WHERE key = 'email_sender_name'), ''), 'SI WAJAH — PT PP (Persero) Tbk') INTO v_sender_name;
  SELECT COALESCE(NULLIF((SELECT value FROM absen_konfigurasi WHERE key = 'email_sender_email'), ''), 'kuswibowo.heri@gmail.com') INTO v_sender_email;
  SELECT COALESCE(NULLIF((SELECT value FROM absen_konfigurasi WHERE key = 'app_url'), ''), 'https://siwajah.pages.dev') INTO v_app_url;

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
    IF lower(v_rec.email) = lower(v_sender_email) THEN
      v_found_sender := true;
    END IF;
    v_to := v_to || jsonb_build_object('email', v_rec.email, 'name', COALESCE(v_rec.nama, 'Admin'));
  END LOOP;

  -- Selalu sertakan email pengirim/penguji kuswibowo.heri@gmail.com agar salinan tes pasti diterima
  IF NOT v_found_sender THEN
    v_to := v_to || jsonb_build_object('email', v_sender_email, 'name', v_sender_name);
  END IF;

  -- 6. Buat Subject & HTML Email Template Resmi Bergaya SIMONIKA
  v_subject := '[SI WAJAH] Ringkasan Pengajuan Pending Approval — PT PP (Persero) Tbk';

  v_html := '<!DOCTYPE html><html><head><meta charset="utf-8">'
    || '<style>'
    || 'body{font-family:Arial,Helvetica,sans-serif;background-color:#f8fafc;color:#334155;margin:0;padding:20px;}'
    || '.container{max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;}'
    || '.header{background-color:#0f172a;padding:24px;text-align:center;color:#ffffff;}'
    || '.header h1{margin:0;font-size:22px;color:#67e8f9;letter-spacing:1px;}'
    || '.header p{margin:4px 0 0 0;font-size:12px;color:#94a3b8;}'
    || '.content{padding:24px;}'
    || '.section-box{background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px;margin-bottom:20px;}'
    || '.section-title{font-size:15px;font-weight:bold;color:#0369a1;margin:0 0 4px 0;}'
    || '.section-subtitle{font-size:12px;color:#0284c7;margin:0;}'
    || '.intro-text{font-size:14px;color:#475569;line-height:1.5;margin-bottom:20px;}'
    || '.alert-box{background-color:#fffbeb;border:1px solid #fef3c7;border-radius:10px;padding:14px;margin-bottom:20px;}'
    || '.alert-title{font-size:14px;font-weight:bold;color:#b45309;margin:0 0 4px 0;}'
    || '.alert-desc{font-size:12px;color:#d97706;margin:0;}'
    || 'table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;}'
    || 'th{background-color:#f1f5f9;color:#475569;text-align:left;padding:10px 12px;border:1px solid #cbd5e1;font-weight:600;}'
    || 'td{padding:10px 12px;border:1px solid #e2e8f0;color:#334155;}'
    || '.btn-container{text-align:center;margin:28px 0 12px 0;}'
    || '.btn{background:#0ea5e9;color:#ffffff!important;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block;}'
    || '.footer{font-size:11px;color:#94a3b8;text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;}'
    || '</style></head><body>'
    || '<div class="container">'
    || '<div class="header"><h1>SI WAJAH</h1><p>Sistem Informasi Web Absensi & Aktifitas Harian — PT PP (Persero) Tbk</p></div>'
    || '<div class="content">'
    || '<div class="section-box">'
    || '<div class="section-title">📋 Ringkasan Pengajuan Menunggu Approval</div>'
    || '<div class="section-subtitle">PENGINGAT OTOMATIS HARIAN (PUKUL 19.00 WIT)</div>'
    || '</div>'
    || '<p class="intro-text">Yth. Bapak/Ibu Pimpinan Proyek & Tim Manajemen,<br><br>Berikut adalah daftar pengajuan presensi karyawan yang <strong>masih belum diproses (status pending)</strong> dan membutuhkan persetujuan Anda:</p>'
    || '<div class="alert-box">'
    || '<div class="alert-title">⚠️ Total ' || v_total_pending || ' Item Menunggu Approval</div>'
    || '<div class="alert-desc">Terdiri dari ' || v_count_laporan || ' Laporan Terlewat dan ' || v_count_izin || ' Pengajuan Izin Pekerja.</div>'
    || '</div>';

  IF v_count_laporan > 0 THEN
    v_html := v_html || '<h4 style="color:#0284c7;margin:20px 0 8px 0;">📋 LAPORAN TERLEWAT (' || v_count_laporan || ' Item)</h4>'
      || '<table><thead><tr><th>Karyawan</th><th>Tanggal & Slot</th><th>Alasan</th></tr></thead><tbody>';
    FOR v_rec IN
      SELECT l.tanggal, l.alasan, k.nama, k.jabatan, s.label AS slot_label
      FROM absen_laporan_terlewat l
      JOIN absen_karyawan k ON k.id = l.karyawan_id
      LEFT JOIN absen_jadwal_slot s ON s.id = l.slot_id
      WHERE l.status = 'PENDING'
      ORDER BY l.tanggal DESC
    LOOP
      v_html := v_html || '<tr><td><strong>' || v_rec.nama || '</strong><br><span style="color:#64748b;font-size:11px;">' || COALESCE(v_rec.jabatan,'-') || '</span></td>'
        || '<td>' || to_char(v_rec.tanggal, 'DD/MM/YYYY') || '<br><span style="color:#0284c7;font-size:11px;">' || COALESCE(v_rec.slot_label,'-') || '</span></td>'
        || '<td>' || v_rec.alasan || '</td></tr>';
    END LOOP;
    v_html := v_html || '</tbody></table>';
  END IF;

  IF v_count_izin > 0 THEN
    v_html := v_html || '<h4 style="color:#0284c7;margin:20px 0 8px 0;">📅 PENGAJUAN IZIN & PEMBATALAN (' || v_count_izin || ' Item)</h4>'
      || '<table><thead><tr><th>Karyawan</th><th>Tipe & Tanggal</th><th>Alasan</th></tr></thead><tbody>';
    FOR v_rec IN
      SELECT i.tanggal_mulai, i.tanggal_selesai, i.jenis, i.alasan, i.status, i.alasan_batal, k.nama, k.jabatan
      FROM absen_izin i
      JOIN absen_karyawan k ON k.id = i.karyawan_id
      WHERE i.status IN ('PENDING', 'CANCEL_REQUESTED')
      ORDER BY i.created_at DESC
    LOOP
      v_html := v_html || '<tr><td><strong>' || v_rec.nama || '</strong><br><span style="color:#64748b;font-size:11px;">' || COALESCE(v_rec.jabatan,'-') || '</span></td>'
        || '<td><strong>' || CASE WHEN v_rec.status = 'CANCEL_REQUESTED' THEN 'Batal Izin' ELSE 'Izin Baru' END || '</strong><br>' || to_char(v_rec.tanggal_mulai, 'DD/MM/YYYY') || '</td>'
        || '<td>' || CASE WHEN v_rec.status = 'CANCEL_REQUESTED' THEN COALESCE(v_rec.alasan_batal, v_rec.alasan) ELSE v_rec.alasan END || '</td></tr>';
    END LOOP;
    v_html := v_html || '</tbody></table>';
  END IF;

  v_html := v_html || '<div class="btn-container"><a href="' || v_app_url || '/laporan-izin" class="btn">Buka Portal Approval Admin ➔</a></div>'
    || '<div class="footer">Email ini dikirim otomatis oleh sistem SI WAJAH — PT PP (Persero) Tbk setiap pukul 19.00 WIT. Mohon tidak membalas email ini.</div>'
    || '</div></div></body></html>';

  -- 7. Trigger Direct HTTP POST to Brevo API (https://api.brevo.com/v3/smtp/email) - Arsitektur SIMONIKA
  IF v_brevo_api_key IS NOT NULL AND v_brevo_api_key != '' THEN
    PERFORM net.http_post(
      url := 'https://api.brevo.com/v3/smtp/email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'api-key', v_brevo_api_key
      ),
      body := jsonb_build_object(
        'sender', jsonb_build_object('name', v_sender_name, 'email', v_sender_email),
        'to', v_to,
        'subject', v_subject,
        'htmlContent', v_html
      )
    );
  END IF;

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
