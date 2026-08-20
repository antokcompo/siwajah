-- ============================================================
-- 034: Daily Overtime Digest Email (Setiap Hari Pukul 19.10 WIT)
--
-- 1. Mengirim notifikasi email otomatis ke Admin & Manajemen pukul 19:10 WIT
--    apabila terdapat daftar pekerja yang terdaftar lembur pada hari tersebut.
-- 2. Email TIDAK AKAN TERKIRIM jika tidak ada daftar lembur pada hari itu.
-- 3. Menggunakan API Key Brevo Langsung (Arsitektur SIMONIKA - Tanpa Link Tombol)
--
-- JALANKAN DI SUPABASE SQL EDITOR
-- ============================================================

CREATE OR REPLACE FUNCTION absen_kirim_digest_daftar_lembur()
RETURNS jsonb AS $$
DECLARE
  v_brevo_api_key text;
  v_sender_name text;
  v_sender_email text;
  v_tz text;
  v_today date;
  v_today_str text;
  v_to jsonb := '[]'::jsonb;
  v_list_lembur jsonb := '[]'::jsonb;
  v_rec record;
  v_count_lembur integer := 0;
  v_subject text;
  v_html text;
  v_found_sender bool := false;
BEGIN
  -- 1. Ambil API Key Brevo & Konfigurasi dari Tabel absen_konfigurasi
  SELECT value INTO v_brevo_api_key FROM absen_konfigurasi WHERE key = 'brevo_api_key';
  SELECT COALESCE(NULLIF((SELECT value FROM absen_konfigurasi WHERE key = 'email_sender_name'), ''), 'SI WAJAH — PT PP (Persero) Tbk') INTO v_sender_name;
  SELECT COALESCE(NULLIF((SELECT value FROM absen_konfigurasi WHERE key = 'email_sender_email'), ''), 'kuswibowo.heri@gmail.com') INTO v_sender_email;
  SELECT COALESCE(NULLIF((SELECT value FROM absen_konfigurasi WHERE key = 'zona_waktu'), ''), 'Asia/Jayapura') INTO v_tz;

  -- Hitung tanggal hari ini sesuai zona waktu proyek (contoh: WIT)
  v_today := (now() AT TIME ZONE v_tz)::date;
  v_today_str := to_char(v_today, 'DD/MM/YYYY');

  -- 2. Ambil List Pekerja yang Terdaftar Lembur Hari Ini
  FOR v_rec IN
    SELECT dl.id, dl.tanggal, dl.catatan, dl.created_at,
           k.nama AS karyawan_nama, COALESCE(k.jabatan, '-') AS jabatan,
           COALESCE(up.nama, '-') AS atasan_nama
    FROM absen_daftar_lembur dl
    JOIN absen_karyawan k ON k.id = dl.karyawan_id
    LEFT JOIN absen_user_profiles up ON up.id = k.atasan_id
    WHERE dl.tanggal = v_today
    ORDER BY k.nama ASC
  LOOP
    v_count_lembur := v_count_lembur + 1;
    v_list_lembur := v_list_lembur || jsonb_build_object(
      'nama', v_rec.karyawan_nama,
      'jabatan', v_rec.jabatan,
      'atasan', v_rec.atasan_nama,
      'catatan', COALESCE(v_rec.catatan, '-')
    );
  END LOOP;

  -- 3. ATURAN UTAMA: Jika TIDAK ADA daftar lembur hari ini, JANGAN KIRIM EMAIL
  IF v_count_lembur = 0 THEN
    RETURN jsonb_build_object('sent', false, 'reason', 'Tidak ada daftar pekerja lembur untuk tanggal hari ini (' || v_today_str || ')');
  END IF;

  -- 4. Ambil Daftar Penerima Email (Admin & Manajemen)
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

  -- Selalu sertakan email pengirim/penguji kuswibowo.heri@gmail.com agar salinan pasti diterima
  IF NOT v_found_sender THEN
    v_to := v_to || jsonb_build_object('email', v_sender_email, 'name', v_sender_name);
  END IF;

  -- 5. Buat Subject & HTML Email Template Resmi (Tanpa Tombol Link)
  v_subject := '[SI WAJAH] Informasi Daftar Lembur Hari Ini (' || v_count_lembur || ' Pekerja) — PT PP (Persero) Tbk';

  v_html := '<!DOCTYPE html><html><head><meta charset="utf-8">'
    || '<style>'
    || 'body{font-family:Arial,Helvetica,sans-serif;background-color:#f8fafc;color:#334155;margin:0;padding:20px;}'
    || '.container{max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;}'
    || '.header{background-color:#0f172a;padding:24px;text-align:center;color:#ffffff;}'
    || '.header h1{margin:0;font-size:22px;color:#67e8f9;letter-spacing:1px;}'
    || '.header p{margin:4px 0 0 0;font-size:12px;color:#94a3b8;}'
    || '.content{padding:24px;}'
    || '.section-box{background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:20px;}'
    || '.section-title{font-size:15px;font-weight:bold;color:#15803d;margin:0 0 4px 0;}'
    || '.section-subtitle{font-size:12px;color:#16a34a;margin:0;}'
    || '.intro-text{font-size:14px;color:#475569;line-height:1.5;margin-bottom:20px;}'
    || '.alert-box{background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px;margin-bottom:20px;}'
    || '.alert-title{font-size:14px;font-weight:bold;color:#1d4ed8;margin:0 0 4px 0;}'
    || '.alert-desc{font-size:12px;color:#2563eb;margin:0;}'
    || 'table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;}'
    || 'th{background-color:#f1f5f9;color:#475569;text-align:left;padding:10px 12px;border:1px solid #cbd5e1;font-weight:600;}'
    || 'td{padding:10px 12px;border:1px solid #e2e8f0;color:#334155;}'
    || '.footer{font-size:11px;color:#94a3b8;text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;}'
    || '</style></head><body>'
    || '<div class="container">'
    || '<div class="header"><h1>SI WAJAH</h1><p>Sistem Informasi Web Absensi & Aktifitas Harian — PT PP (Persero) Tbk</p></div>'
    || '<div class="content">'
    || '<div class="section-box">'
    || '<div class="section-title">🌙 Informasi Daftar Pekerja Lembur</div>'
    || '<div class="section-subtitle">PENGINGAT LEMBUR HARIAN (PUKUL 19.10 WIT)</div>'
    || '</div>'
    || '<p class="intro-text">Yth. Bapak/Ibu Pimpinan Proyek & Tim Manajemen,<br><br>Berikut adalah daftar pekerja yang <strong>terdaftar untuk melaksanakan lembur</strong> pada hari ini (<strong>' || v_today_str || '</strong>):</p>'
    || '<div class="alert-box">'
    || '<div class="alert-title">🌙 Total ' || v_count_lembur || ' Pekerja Terdaftar Lembur</div>'
    || '<div class="alert-desc">Pekerja di bawah ini telah didaftarkan oleh Admin dan berhak melakukan presensi scan lembur.</div>'
    || '</div>'
    || '<table><thead><tr><th>Karyawan</th><th>Atasan / Mandor</th><th>Catatan Lembur</th></tr></thead><tbody>';

  FOR v_rec IN
    SELECT dl.catatan, k.nama, k.jabatan, COALESCE(up.nama, '-') AS atasan_nama
    FROM absen_daftar_lembur dl
    JOIN absen_karyawan k ON k.id = dl.karyawan_id
    LEFT JOIN absen_user_profiles up ON up.id = k.atasan_id
    WHERE dl.tanggal = v_today
    ORDER BY k.nama ASC
  LOOP
    v_html := v_html || '<tr><td><strong>' || v_rec.nama || '</strong><br><span style="color:#64748b;font-size:11px;">' || COALESCE(v_rec.jabatan,'-') || '</span></td>'
      || '<td>' || v_rec.atasan_nama || '</td>'
      || '<td>' || COALESCE(v_rec.catatan, '-') || '</td></tr>';
  END LOOP;

  v_html := v_html || '</tbody></table>'
    || '<div class="footer">Email ini dikirim otomatis oleh sistem SI WAJAH — PT PP (Persero) Tbk setiap pukul 19.10 WIT. Mohon tidak membalas email ini.</div>'
    || '</div></div></body></html>';

  -- 6. Trigger Direct HTTP POST to Brevo API (https://api.brevo.com/v3/smtp/email) - Arsitektur SIMONIKA
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
    'count_lembur', v_count_lembur,
    'tanggal', v_today_str
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Jadwalkan pg_cron Otomatis Setiap Hari Pukul 19.10 WIT (10.10 UTC)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.schedule(
  'daily-overtime-digest-1910',
  '10 10 * * *',
  $$SELECT absen_kirim_digest_daftar_lembur()$$
);
