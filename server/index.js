import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const PORT = process.env.PORT || 3001

const BREVO_API_KEY = process.env.BREVO_API_KEY || ''

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', brevo_configured: !!BREVO_API_KEY })
})

app.post('/api/notify-lembur', async (req, res) => {
  if (!BREVO_API_KEY) {
    return res.status(500).json({ error: 'BREVO_API_KEY not configured' })
  }

  const { to, subject, tanggal, karyawan, created_by, sender_name, sender_email, app_url } = req.body

  if (!to || !Array.isArray(to) || to.length === 0) {
    return res.status(400).json({ error: 'Missing recipients (to)' })
  }
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

  const linkHtml = app_url
    ? `<a href="${app_url}" style="display:inline-block;background:#0ea5e9;color:#ffffff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Akses SI WAJAH</a>`
    : '<p style="color:#64748b;font-size:13px;">Silakan akses SI WAJAH untuk melakukan approval.</p>'

  const htmlContent = `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f8fafc;">
    <div style="max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:#0f172a;padding:20px 24px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;color:#67e8f9;font-size:20px;">SI WAJAH</h1>
        <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Sistem Informasi Web Absensi & Aktifitas Harian</p>
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
        ${linkHtml}
      </div>
      <p style="margin:16px 0 0;color:#94a3b8;font-size:11px;text-align:center;">Email ini dikirim otomatis oleh sistem SI WAJAH. Mohon tidak membalas email ini.</p>
    </div>
  </body></html>`

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: sender_name || 'SI WAJAH',
          email: sender_email || 'noreply@siwajah.app',
        },
        to,
        subject: subject || `Pengajuan Lembur - ${tanggal}`,
        htmlContent,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Brevo API error:', response.status, err)
      return res.status(502).json({ error: 'Brevo API error', status: response.status, detail: err })
    }

    const result = await response.json()
    res.json({ success: true, messageId: result.messageId })
  } catch (err) {
    console.error('Email send failed:', err)
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`SI WAJAH API running on port ${PORT}`)
})
