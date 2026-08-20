import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const PORT = process.env.PORT || 3001

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://htveuwyqfkiqsvpbceet.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabaseAdmin = (SUPABASE_URL && (SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY))
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  : null

const BREVO_API_KEY = process.env.BREVO_API_KEY || ''
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'kuswibowo.heri@gmail.com'
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'SiWajah'

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    brevo_configured: !!BREVO_API_KEY,
    brevo_sender_email: BREVO_SENDER_EMAIL,
    supabase_configured: !!supabaseAdmin,
    has_service_role: !!SUPABASE_SERVICE_ROLE_KEY,
  })
})

// Create user via Supabase GoTrue Admin API
app.post('/api/admin/create-user', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase Admin Client not configured' })
  }
  const { email, password, nama, role } = req.body
  if (!email || !password || !nama || !role) {
    return res.status(400).json({ error: 'Missing required fields (email, password, nama, role)' })
  }

  const cleanEmail = email.trim().toLowerCase()

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
    user_metadata: { nama }
  })

  if (error) {
    console.error('Create user error:', error)
    return res.status(400).json({ error: error.message })
  }

  const userId = data.user.id

  const { error: profileErr } = await supabaseAdmin
    .from('absen_user_profiles')
    .upsert({ id: userId, nama, role }, { onConflict: 'id' })

  if (profileErr) {
    console.error('Profile upsert error:', profileErr)
  }

  return res.json({ success: true, user: data.user })
})

// Reset password via Supabase GoTrue Admin API
app.post('/api/admin/reset-password', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase Admin Client not configured' })
  }
  const { user_id, password } = req.body
  if (!user_id || !password) {
    return res.status(400).json({ error: 'Missing required fields (user_id, password)' })
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
    password,
    email_confirm: true
  })

  if (error) {
    console.error('Reset password error:', error)
    return res.status(400).json({ error: error.message })
  }

  return res.json({ success: true, user: data.user })
})

// Delete user via Supabase GoTrue Admin API
app.post('/api/admin/delete-user', async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase Admin Client not configured' })
  }
  const { user_id } = req.body
  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id' })
  }

  await supabaseAdmin.from('absen_user_profiles').delete().eq('id', user_id)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id)

  if (error) {
    console.error('Delete user error:', error)
    return res.status(400).json({ error: error.message })
  }

  return res.json({ success: true })
})

// Send email notification using BREVO_API_KEY from Render Environment Variables (SIMONIKA Architecture)
app.post('/api/notify-lembur', async (req, res) => {
  if (!BREVO_API_KEY) {
    console.error('BREVO_API_KEY not configured in Render environment variables')
    return res.status(500).json({ error: 'BREVO_API_KEY not configured in Render Environment Variables' })
  }

  const { to, subject, tanggal, karyawan, created_by, sender_name, sender_email, htmlContent, html } = req.body

  const finalSenderEmail = (typeof sender_email === 'string' && sender_email.trim().length > 0) ? sender_email.trim() : BREVO_SENDER_EMAIL
  const finalSenderName = (typeof sender_name === 'string' && sender_name.trim().length > 0) ? sender_name.trim() : BREVO_SENDER_NAME

  // Sanitize recipients list
  let validRecipients = []
  if (Array.isArray(to)) {
    validRecipients = to
      .map(item => typeof item === 'string' ? { email: item.trim() } : item)
      .filter(item => item && typeof item.email === 'string' && item.email.includes('@'))
  }

  // Fallback recipient
  if (validRecipients.length === 0) {
    validRecipients.push({ email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME })
  }

  let finalHtml = htmlContent || html

  if (!finalHtml) {
    if (!karyawan || !Array.isArray(karyawan) || karyawan.length === 0) {
      return res.status(400).json({ error: 'Missing karyawan data' })
    }

    const employeeRows = karyawan.map(k =>
      `<tr>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;">${k.nama}</td>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;">${k.jabatan || '-'}</td>
        <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;">${k.mandor || '-'}</td>
      </tr>`
    ).join('')

    finalHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f8fafc;">
      <div style="max-width:600px;margin:0 auto;padding:24px;">
        <div style="background:#0f172a;padding:20px 24px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;color:#67e8f9;font-size:20px;">SI WAJAH</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Sistem Informasi Web Absensi & Aktifitas Harian — PT PP (Persero) Tbk</p>
        </div>
        <div style="background:#ffffff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
          <h2 style="margin:0 0 8px;color:#1e293b;font-size:18px;">Pengajuan Lembur Baru</h2>
          <p style="margin:0 0 16px;color:#64748b;font-size:14px;line-height:1.5;">
            Pengajuan lembur untuk tanggal <strong style="color:#1e293b;">${tanggal}</strong>
            telah dibuat oleh <strong style="color:#1e293b;">${created_by || 'Admin'}</strong>
            dan membutuhkan approval Anda.
          </p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <thead><tr style="background:#f1f5f9;">
              <th style="padding:10px 12px;border:1px solid #e2e8f0;text-align:left;font-size:13px;color:#475569;font-weight:600;">Nama Pekerja</th>
              <th style="padding:10px 12px;border:1px solid #e2e8f0;text-align:left;font-size:13px;color:#475569;font-weight:600;">Jabatan</th>
              <th style="padding:10px 12px;border:1px solid #e2e8f0;text-align:left;font-size:13px;color:#475569;font-weight:600;">Mandor</th>
            </tr></thead>
            <tbody>${employeeRows}</tbody>
          </table>
        </div>
        <p style="margin:16px 0 0;color:#94a3b8;font-size:11px;text-align:center;">Email ini dikirim otomatis oleh sistem SI WAJAH. Mohon tidak membalas email ini.</p>
      </div>
    </body></html>`
  }

  const payload = {
    sender: {
      name: finalSenderName,
      email: finalSenderEmail,
    },
    to: validRecipients,
    subject: subject || `[SI WAJAH] Notifikasi Presensi - ${tanggal || ''}`,
    htmlContent: finalHtml,
  }

  console.log('Sending Brevo payload:', JSON.stringify({ sender: payload.sender, to_count: payload.to.length, subject: payload.subject }))

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Brevo API Error:', response.status, err)
      return res.status(502).json({ error: 'Brevo API error', status: response.status, detail: err })
    }

    const result = await response.json()
    console.log('Brevo Email Sent Successfully! Message ID:', result.messageId)
    res.json({ success: true, messageId: result.messageId, recipients: validRecipients.length })
  } catch (err) {
    console.error('Email send failed:', err)
    res.status(500).json({ error: err.message })
  }
})

// Register route handlers for root, /api/notify-lembur, and /api/notify-digest
app.post('/', (req, res) => res.redirect(307, '/api/notify-lembur'))
app.post('/api/notify-digest', (req, res) => res.redirect(307, '/api/notify-lembur'))

app.listen(PORT, () => {
  console.log(`SI WAJAH API running on port ${PORT}`)
})
