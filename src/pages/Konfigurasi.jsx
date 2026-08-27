import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Save, Clock, Timer, AlertTriangle, Shield, CheckCircle, CheckCircle2, AlertCircle, RotateCcw, ChevronDown, ChevronUp, Info, Globe, Mail, X, MapPin } from 'lucide-react'
import SiteMapPicker from '../components/SiteMapPicker'
import { getActiveProject } from './PilihProyek'

const timezoneOptions = [
  { value: 'Asia/Jakarta', label: 'WIB — Waktu Indonesia Barat (UTC+7)' },
  { value: 'Asia/Makassar', label: 'WITA — Waktu Indonesia Tengah (UTC+8)' },
  { value: 'Asia/Jayapura', label: 'WIT — Waktu Indonesia Timur (UTC+9)' },
]

const sections = [
  {
    id: 'geofence',
    title: 'Koordinat & Radius Site Proyek (Geofencing)',
    icon: MapPin,
    color: 'emerald',
    description: 'Tentukan lokasi koordinat GPS pusat site/proyek dan radius batas toleransi presensi.',
    fields: [
      { key: 'site_nama', label: 'Nama Site / Lokasi Proyek', type: 'text', default: 'Site Proyek Utama', help: 'Nama lokasi site proyek' },
      { key: 'site_lat', label: 'Latitude Site Proyek', type: 'text', default: '-6.200000', help: 'Koordinat latitude titik pusat lokasi proyek' },
      { key: 'site_lng', label: 'Longitude Site Proyek', type: 'text', default: '106.816666', help: 'Koordinat longitude titik pusat lokasi proyek' },
      { key: 'site_radius_meter', label: 'Radius Toleransi Site', type: 'number', default: '500', unit: 'meter', help: 'Presensi di luar radius ini dianggap Dari Luar Lokasi Proyek' },
    ],
  },
  {
    id: 'timezone',
    title: 'Zona Waktu',
    icon: Globe,
    color: 'indigo',
    description: 'Zona waktu lokasi proyek untuk konversi timestamp mesin absen.',
    fields: [
      { key: 'zona_waktu', label: 'Zona Waktu Lokasi Proyek', type: 'timezone', default: 'Asia/Jayapura', help: 'Semua jam scan akan dikonversi ke zona waktu ini' },
    ],
  },
  {
    id: 'jendela',
    title: 'Jendela Waktu Absensi',
    icon: Clock,
    color: 'blue',
    description: 'Tentukan rentang jam yang digunakan sistem untuk mengklasifikasikan setiap scan sebagai masuk, istirahat, atau pulang.',
    fields: [
      { key: 'jam_masuk_awal', label: 'Jendela Masuk — Mulai', type: 'time', default: '04:00', help: 'Scan paling awal dalam jendela ini dianggap jam masuk' },
      { key: 'jam_masuk_akhir', label: 'Jendela Masuk — Akhir', type: 'time', default: '10:59', help: 'Batas akhir jendela masuk' },
      { key: 'jam_pulang_mulai', label: 'Jendela Pulang — Mulai', type: 'time', default: '14:30', help: 'Scan paling akhir setelah jam ini dianggap jam pulang' },
      { key: 'dedup_menit', label: 'Deduplikasi Scan', type: 'number', default: '3', unit: 'menit', help: 'Tap ganda dalam interval ini diabaikan (UID + tanggal sama)' },
    ],
  },
  {
    id: 'lembur',
    title: 'Perhitungan Lembur',
    icon: Timer,
    color: 'amber',
    description: 'Parameter yang mengatur kapan lembur mulai dihitung dan batas maksimumnya.',
    fields: [
      { key: 'lembur_ambang', label: 'Ambang Lembur (jam pulang min)', type: 'time', default: '18:30', help: 'Pulang sebelum jam ini = tidak ada lembur' },
      { key: 'lembur_mulai_hitung', label: 'Lembur Mulai Dihitung', type: 'time', default: '19:00', help: 'Durasi lembur = jam pulang − jam ini' },
      { key: 'lembur_maks_jam', label: 'Lembur Maksimum', type: 'number', default: '4', unit: 'jam/hari', help: 'Lebih dari ini wajib disertai alasan khusus' },
      { key: 'lembur_pembulatan_menit', label: 'Pembulatan Lembur', type: 'number', default: '15', unit: 'menit', help: 'Durasi lembur dibulatkan ke bawah kelipatan ini' },
    ],
  },
  {
    id: 'kontrol',
    title: 'Deteksi Anomali & Koreksi',
    icon: Shield,
    color: 'rose',
    description: 'Pengaturan ambang deteksi kegagalan mesin dan batasan koreksi manual oleh atasan.',
    fields: [
      { key: 'anomali_persen_ambang', label: 'Ambang Anomali Massal', type: 'number', default: '50', unit: '%', help: 'Jika kehadiran LENGKAP turun di bawah X% dari rata-rata → tandai INSIDEN' },
      { key: 'kuota_koreksi', label: 'Kuota Koreksi per Karyawan', type: 'number', default: '3', unit: '/bulan', help: 'Melebihi kuota ini wajib persetujuan HRD atau Admin' },
    ],
  },
  {
    id: 'email',
    title: 'Notifikasi Email (Brevo Render Service)',
    icon: Mail,
    color: 'indigo',
    description: 'Pengaturan kredensial Brevo dikelola di Render Environment Variables (BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME).',
    fields: [
      { key: 'app_url', label: 'URL Aplikasi SI WAJAH', type: 'text', default: 'https://siwajah.pages.dev', help: 'URL SI WAJAH untuk link tombol pada email' },
    ],
  },
]

const allFields = sections.flatMap(s => s.fields)
const defaultValues = Object.fromEntries(allFields.map(f => [f.key, f.default]))

const colorMap = {
  indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-200', ring: 'ring-indigo-100', dot: 'bg-indigo-500' },
  blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-200', ring: 'ring-blue-100', dot: 'bg-blue-500' },
  amber: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-200', ring: 'ring-amber-100', dot: 'bg-amber-500' },
  rose: { bg: 'bg-rose-50', icon: 'text-rose-600', border: 'border-rose-200', ring: 'ring-rose-100', dot: 'bg-rose-500' },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-200', ring: 'ring-emerald-100', dot: 'bg-emerald-500' },
}

export default function Konfigurasi() {
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const [changed, setChanged] = useState({})
  const [origValues, setOrigValues] = useState({})
  const [testing, setTesting] = useState(false)
  const [testResultModal, setTestResultModal] = useState(null)

  useEffect(() => { load() }, [])

  async function handleTestDigest() {
    setTesting(true)
    try {
      // 1. Ambil data pending dari Supabase
      const { data, error } = await supabase.rpc('absen_kirim_digest_pending_approval')
      if (error) throw error

      if (!data?.sent) {
        setTestResultModal({
          success: false,
          reason: data?.reason || 'Tidak ada pengajuan pending',
          message: `Dibatalkan: ${data?.reason || 'Tidak ada pengajuan pending'}`
        })
        return
      }

      // 2. Eksekusi pengiriman email via Render Service (yang membaca BREVO_API_KEY dari Environment Variables Render)
      const appUrl = values.app_url?.trim() || 'https://siwajah.pages.dev'
      const res = await fetch('https://siwajah-api.onrender.com/api/notify-lembur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'pending_digest',
          subject: '[SI WAJAH] Ringkasan Pengajuan Pending Approval — PT PP (Persero) Tbk',
          html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;padding:20px;background:#f8fafc;">
            <div style="max-width:600px;margin:0 auto;background:#ffffff;padding:24px;border-radius:12px;border:1px solid #e2e8f0;">
              <div style="background:#0f172a;padding:20px;border-radius:10px 10px 0 0;text-align:center;">
                <h2 style="color:#67e8f9;margin:0;">SI WAJAH</h2>
                <p style="color:#94a3b8;margin:4px 0 0;font-size:12px;">Sistem Informasi Web Absensi & Aktifitas Harian — PT PP (Persero) Tbk</p>
              </div>
              <div style="padding:20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;">
                <h3 style="color:#0284c7;margin:0 0 8px;">Tes Email Digest Pending Approval</h3>
                <p style="color:#475569;font-size:14px;line-height:1.5;">
                  Email tes ini dikirim dari server Render <strong>siwajah-api</strong> menggunakan <strong>BREVO_API_KEY</strong> di Environment Render.
                </p>
                <div style="background:#fffbeb;border:1px solid #fef3c7;padding:12px;border-radius:8px;margin:16px 0;">
                  <strong style="color:#b45309;font-size:13px;">Total ${data?.total_pending || 0} Item Pending</strong>
                  <p style="color:#d97706;font-size:12px;margin:4px 0 0;">(${data?.count_laporan || 0} Laporan Terlewat, ${data?.count_izin || 0} Pengajuan Izin)</p>
                </div>
              </div>
              <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:16px;">Email dikirim otomatis oleh SI WAJAH — PT PP (Persero) Tbk.</p>
            </div>
          </body></html>`,
          to: [{ email: 'kuswibowo.heri@gmail.com', name: 'Kuswibowo Heri' }]
        })
      })

      const resText = await res.text()
      let resJson = {}
      try { resJson = JSON.parse(resText) } catch (e) {}

      if (res.ok && resJson.success) {
        setTestResultModal({
          success: true,
          recipientsCount: resJson.recipients || 1,
          totalPending: data?.total_pending || 0,
          countLaporan: data?.count_laporan || 0,
          countIzin: data?.count_izin || 0,
          senderEmail: 'Dikonfigurasi di Environment Render (kuswibowo.heri@gmail.com)',
          messageId: resJson.messageId || 'Success',
          message: `Berhasil! Server Render API (menggunakan BREVO_API_KEY dari Environment Variables Render) mengonfirmasi pengiriman email digest (Message ID: ${resJson.messageId || 'Success'}).`
        })
      } else {
        setTestResultModal({
          success: false,
          reason: resJson.error || resJson.detail || resText || `HTTP Status ${res.status}`,
          message: `Render Brevo API Error (${res.status}): ${resJson.detail || resJson.error || resText || 'Server Render gagal memproses pengiriman email'}`
        })
      }
    } catch (err) {
      setTestResultModal({
        success: false,
        reason: err.message,
        message: `Gagal mengirim email via Render API: ${err.message}`
      })
    } finally {
      setTesting(false)
    }
  }

  async function handleTestLemburDigest() {
    setTesting(true)
    try {
      // 1. Ambil tanggal hari ini (WIT UTC+9)
      const nowJayapura = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jayapura' }))
      const yyyy = nowJayapura.getFullYear()
      const mm = String(nowJayapura.getMonth() + 1).padStart(2, '0')
      const dd = String(nowJayapura.getDate()).padStart(2, '0')
      const todayStr = `${yyyy}-${mm}-${dd}`
      const todayFmt = `${dd}/${mm}/${yyyy}`

      // 2. Query data lembur hari ini dari Supabase (3 query mandiri tanpa relasi PostgREST)
      const { data: listLembur, error: errLembur } = await supabase
        .from('absen_daftar_lembur')
        .select('id, tanggal, catatan, karyawan_id')
        .eq('tanggal', todayStr)

      if (errLembur) throw errLembur

      if (!listLembur || listLembur.length === 0) {
        setTestResultModal({
          title: 'Uji Coba Email Digest Lembur',
          subtitle: 'Pengingat Lembur Pukul 19.10 WIT',
          success: false,
          reason: `Tidak ada pekerja terdaftar lembur untuk tanggal hari ini (${todayFmt}).`,
          message: `Dibatalkan: Tidak ada pekerja terdaftar lembur untuk tanggal hari ini (${todayFmt}). Daftarkan lembur terlebih dahulu pada menu Daftar Lembur.`
        })
        return
      }

      // Query data karyawan & atasan secara terpisah (bebas dari error PostgREST relationship cache)
      const kIds = listLembur.map(item => item.karyawan_id).filter(Boolean)
      const { data: listKaryawan } = await supabase
        .from('absen_karyawan')
        .select('id, nama, jabatan, atasan_id')
        .in('id', kIds)

      const karyawanMap = {}
      if (listKaryawan) listKaryawan.forEach(k => { karyawanMap[k.id] = k })

      // Query nama atasan/mandor dari absen_user_profiles
      const { data: profiles } = await supabase.from('absen_user_profiles').select('id, nama')
      const profileMap = {}
      if (profiles) profiles.forEach(p => { profileMap[p.id] = p.nama })

      const rowsHtml = listLembur.map(item => {
        const kObj = karyawanMap[item.karyawan_id] || {}
        const atasanNama = profileMap[kObj.atasan_id] || 'Harian Kantor'
        return `<tr>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#334155;"><strong>${kObj.nama || '-'}</strong><br><span style="color:#64748b;font-size:11px;">${kObj.jabatan || '-'}</span></td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#334155;">${atasanNama}</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#334155;">${item.catatan || '-'}</td>
        </tr>`
      }).join('')

      const htmlTemplate = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <style>
          body{font-family:Arial,Helvetica,sans-serif;background-color:#f8fafc;color:#334155;margin:0;padding:20px;}
          .container{max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;}
          .header{background-color:#0f172a;padding:24px;text-align:center;color:#ffffff;}
          .header h1{margin:0;font-size:22px;color:#67e8f9;letter-spacing:1px;}
          .header p{margin:4px 0 0 0;font-size:12px;color:#94a3b8;}
          .content{padding:24px;}
          .section-box{background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:20px;}
          .section-title{font-size:15px;font-weight:bold;color:#15803d;margin:0 0 4px 0;}
          .section-subtitle{font-size:12px;color:#16a34a;margin:0;}
          .intro-text{font-size:14px;color:#475569;line-height:1.5;margin-bottom:20px;}
          .alert-box{background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px;margin-bottom:20px;}
          .alert-title{font-size:14px;font-weight:bold;color:#1d4ed8;margin:0 0 4px 0;}
          .alert-desc{font-size:12px;color:#2563eb;margin:0;}
          table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px;}
          th{background-color:#f1f5f9;color:#475569;text-align:left;padding:10px 12px;border:1px solid #cbd5e1;font-weight:600;}
          td{padding:10px 12px;border:1px solid #e2e8f0;color:#334155;}
          .footer{font-size:11px;color:#94a3b8;text-align:center;margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;}
        </style></head><body>
        <div class="container">
          <div class="header"><h1>SI WAJAH</h1><p>Sistem Informasi Web Absensi & Aktifitas Harian — PT PP (Persero) Tbk</p></div>
          <div class="content">
            <div class="section-box">
              <div class="section-title">Informasi Daftar Pekerja Lembur</div>
              <div class="section-subtitle">PENGINGAT LEMBUR HARIAN (PUKUL 19.10 WIT)</div>
            </div>
            <p class="intro-text">Yth. Bapak/Ibu Pimpinan Proyek & Tim Manajemen,<br><br>Berikut adalah daftar pekerja yang <strong>terdaftar untuk melaksanakan lembur</strong> pada hari ini (<strong>${todayFmt}</strong>):</p>
            <div class="alert-box">
              <div class="alert-title">Total ${listLembur.length} Pekerja Terdaftar Lembur</div>
              <div class="alert-desc">Pekerja di bawah ini telah didaftarkan oleh Admin dan berhak melakukan presensi scan lembur.</div>
            </div>
            <table><thead><tr><th>Karyawan</th><th>Atasan / Mandor</th><th>Catatan Lembur</th></tr></thead><tbody>
              ${rowsHtml}
            </tbody></table>
            <div class="footer">Email ini dikirim otomatis oleh sistem SI WAJAH — PT PP (Persero) Tbk setiap pukul 19.10 WIT. Mohon tidak membalas email ini.</div>
          </div>
        </div></body></html>`

      // 3. Panggil Render Service untuk kirim via Brevo API Key
      const res = await fetch('https://siwajah-api.onrender.com/api/notify-lembur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'overtime_digest',
          subject: `[SI WAJAH] Informasi Daftar Lembur Hari Ini (${listLembur.length} Pekerja) — PT PP (Persero) Tbk`,
          html: htmlTemplate,
          to: [{ email: 'kuswibowo.heri@gmail.com', name: 'Kuswibowo Heri' }]
        })
      })

      const resText = await res.text()
      let resJson = {}
      try { resJson = JSON.parse(resText) } catch (e) {}

      if (res.ok && resJson.success) {
        setTestResultModal({
          title: 'Uji Coba Email Digest Lembur',
          subtitle: 'Pengingat Lembur Pukul 19.10 WIT',
          success: true,
          recipientsCount: resJson.recipients || 1,
          totalPending: listLembur.length,
          countLaporan: listLembur.length,
          countIzin: 0,
          senderEmail: 'Dikonfigurasi di Environment Render (kuswibowo.heri@gmail.com)',
          messageId: resJson.messageId || 'Success',
          message: `Berhasil! Server Render API mengonfirmasi email digest lembur (${listLembur.length} pekerja) terkirim (Message ID: ${resJson.messageId || 'Success'}). Email telah dikirimkan ke kuswibowo.heri@gmail.com!`
        })
      } else {
        setTestResultModal({
          title: 'Uji Coba Email Digest Lembur',
          subtitle: 'Pengingat Lembur Pukul 19.10 WIT',
          success: false,
          reason: resJson.error || resJson.detail || resText || `HTTP Status ${res.status}`,
          message: `Render Brevo API Error (${res.status}): ${resJson.detail || resJson.error || resText || 'Server Render gagal memproses pengiriman email'}`
        })
      }
    } catch (err) {
      setTestResultModal({
        title: 'Uji Coba Email Digest Lembur',
        subtitle: 'Pengingat Lembur Pukul 19.10 WIT',
        success: false,
        reason: err.message,
        message: `Gagal mengirim email digest lembur: ${err.message}`
      })
    } finally {
      setTesting(false)
    }
  }

  async function load() {
    setLoading(true)
    setError('')
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    // Load per-project settings from absen_proyek first
    const { data: pData } = await supabase
      .from('absen_proyek')
      .select('*')
      .eq('kode_proyek', activeKode)
      .maybeSingle()

    const map = { ...defaultValues }
    if (pData) {
      if (pData.zona_waktu) map.zona_waktu = pData.zona_waktu
      if (pData.latitude) map.site_lat = String(pData.latitude)
      if (pData.longitude) map.site_lng = String(pData.longitude)
      if (pData.radius_meter) map.site_radius_meter = String(pData.radius_meter)
      if (pData.nama_proyek) map.site_nama = pData.nama_proyek
    }

    const { data, error: err } = await supabase
      .from('absen_konfigurasi')
      .select('key, value')
      .eq('kode_proyek', activeKode)

    if (data && data.length > 0) {
      data.forEach(d => { if (d.value) map[d.key] = d.value })
    }

    setValues(map)
    setOrigValues(map)
    setChanged({})
    setLoading(false)
  }

  function handleChange(key, val) {
    setValues(prev => ({ ...prev, [key]: val }))
    setChanged(prev => ({ ...prev, [key]: val !== origValues[key] }))
  }

  function resetToDefaults() {
    setValues({ ...defaultValues })
    const ch = {}
    allFields.forEach(f => { ch[f.key] = defaultValues[f.key] !== origValues[f.key] })
    setChanged(ch)
  }

  const hasChanges = Object.values(changed).some(Boolean)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')

    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    let tzLabel = 'WIT (UTC+9)'
    if (values.zona_waktu === 'Asia/Jakarta') tzLabel = 'WIB (UTC+7)'
    if (values.zona_waktu === 'Asia/Makassar') tzLabel = 'WITA (UTC+8)'

    try {
      await supabase.from('absen_proyek').update({
        zona_waktu: values.zona_waktu,
        tz_label: tzLabel,
        latitude: values.site_lat ? Number(values.site_lat) : null,
        longitude: values.site_lng ? Number(values.site_lng) : null,
        radius_meter: values.site_radius_meter ? Number(values.site_radius_meter) : null,
        updated_at: new Date().toISOString()
      }).eq('kode_proyek', activeKode)
    } catch (e) {}

    const rows = allFields
      .filter(f => values[f.key] !== undefined && values[f.key] !== '')
      .map(f => ({
        kode_proyek: activeKode,
        key: f.key,
        value: values[f.key],
        deskripsi: f.label,
        updated_at: new Date().toISOString(),
      }))

    const { error: err } = await supabase
      .from('absen_konfigurasi')
      .upsert(rows, { onConflict: 'kode_proyek, key' })

    if (err) {
      setError('Gagal menyimpan: ' + err.message)
    } else {
      setSaved(true)
      setOrigValues({ ...values })
      setChanged({})
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  function toggle(id) {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Konfigurasi Sistem</h1>
          <p className="text-gray-500 text-xs mt-0.5">Atur parameter absensi, lembur, dan deteksi anomali</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={resetToDefaults} className="btn-secondary" style={{ background: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.15)', color: '#e2e8f0' }}>
            <RotateCcw size={14} /> Reset Default
          </button>
        </div>
      </div>

      <div className="main-content">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3 text-sm">
          <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <span className="text-red-700">{error}</span>
            <button onClick={load} className="block mt-1 text-xs text-red-600 underline hover:text-red-800">Coba muat ulang</button>
          </div>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {sections.map(section => {
          const Icon = section.icon
          const colors = colorMap[section.color]
          const isCollapsed = collapsed[section.id]
          const sectionHasChanges = section.fields.some(f => changed[f.key])

          return (
            <div key={section.id} className={`card overflow-hidden transition-all duration-200 ${sectionHasChanges ? 'ring-2 ' + colors.ring : ''}`}>
              <button
                type="button"
                onClick={() => toggle(section.id)}
                className="w-full px-5 py-4 flex items-center gap-3 hover:bg-gray-50/50 transition-colors duration-150"
              >
                <div className={`w-9 h-9 ${colors.bg} rounded-lg flex items-center justify-center shrink-0`}>
                  <Icon size={18} className={colors.icon} />
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-[15px]">{section.title}</span>
                    {sectionHasChanges && <span className={`w-2 h-2 rounded-full ${colors.dot} animate-pulse`} />}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{section.description}</p>
                </div>
                <div className="text-gray-400 shrink-0">
                  {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                </div>
              </button>

              <div className={`transition-all duration-300 ease-in-out ${isCollapsed ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-[1400px] opacity-100'}`}>
                <div className="px-5 pb-5 pt-1">
                  <div className={`grid gap-4 ${section.fields.length === 1 ? '' : 'sm:grid-cols-2'}`}>
                    {section.fields.map(f => (
                      <div key={f.key} className={`group ${f.type === 'timezone' ? 'sm:col-span-2' : ''}`}>
                        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                          {f.label}
                          {f.unit && <span className="text-xs font-normal text-gray-400">({f.unit})</span>}
                          {changed[f.key] && <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />}
                        </label>
                        {f.type === 'timezone' ? (
                          <select
                            value={values[f.key] || defaultValues[f.key]}
                            onChange={e => handleChange(f.key, e.target.value)}
                            className={`input-field ${changed[f.key] ? 'border-blue-400 ring-2 ring-blue-100' : ''}`}
                          >
                            {timezoneOptions.map(tz => (
                              <option key={tz.value} value={tz.value}>{tz.label}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="relative">
                            <input
                              type={f.type === 'password' ? 'password' : f.type === 'time' ? 'time' : f.type === 'text' ? 'text' : 'number'}
                              value={values[f.key] || ''}
                              onChange={e => handleChange(f.key, e.target.value)}
                              step={f.type === 'number' ? 'any' : undefined}
                              placeholder={f.type === 'text' || f.type === 'password' ? f.help?.split('(')[0]?.trim() : undefined}
                              autoComplete={f.type === 'password' ? 'off' : undefined}
                              className={`input-field ${changed[f.key] ? 'border-blue-400 ring-2 ring-blue-100' : ''}`}
                            />
                          </div>
                        )}
                        {f.help && (
                          <p className="flex items-start gap-1 mt-1.5 text-xs text-gray-400 leading-relaxed">
                            <Info size={12} className="shrink-0 mt-0.5" />
                            {f.help}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {section.id === 'geofence' && (
                    <SiteMapPicker
                      lat={values.site_lat}
                      lng={values.site_lng}
                      radius={values.site_radius_meter}
                      onChange={(newLat, newLng) => {
                        handleChange('site_lat', newLat)
                        handleChange('site_lng', newLng)
                      }}
                    />
                  )}

                  {section.id === 'email' && (
                    <div className="mt-4 pt-3 border-t flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleTestDigest}
                        disabled={testing}
                        className="px-3.5 py-2 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
                      >
                        {testing ? (
                          <><div className="w-3.5 h-3.5 border-2 border-indigo-400/30 border-t-indigo-600 rounded-full animate-spin" /> Mengirim Test Digest...</>
                        ) : (
                          <><Mail size={14} /> Tes Kirim Email Digest Pending (19.00)</>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleTestLemburDigest}
                        disabled={testing}
                        className="px-3.5 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 transition-colors flex items-center gap-1.5"
                      >
                        {testing ? (
                          <><div className="w-3.5 h-3.5 border-2 border-emerald-400/30 border-t-emerald-600 rounded-full animate-spin" /> Mengirim Test Lembur...</>
                        ) : (
                          <><Mail size={14} /> Tes Kirim Email Digest Lembur (19.10)</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Save bar */}
        <div className={`card px-5 py-4 flex items-center justify-between transition-all duration-300 ${hasChanges ? 'ring-2 ring-blue-200 border-blue-300' : ''}`}>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving || !hasChanges} className="btn-primary">
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Menyimpan...</>
              ) : (
                <><Save size={15} /> Simpan Perubahan</>
              )}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 font-medium animate-fade-in">
                <CheckCircle size={16} /> Berhasil disimpan
              </span>
            )}
          </div>
          {hasChanges && (
            <span className="text-xs text-blue-600 font-medium">
              {Object.values(changed).filter(Boolean).length} parameter berubah
            </span>
          )}
        </div>
      </form>
      </div>

      {/* Modal Konfirmasi Uji Coba Email Digest (Professional UI) */}
      {testResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${testResultModal.success ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                  <Mail size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">{testResultModal.title || 'Uji Coba Email Digest'}</h3>
                  <p className="text-[11px] text-slate-400">{testResultModal.subtitle || 'Pengingat Approval Pukul 19.00 WIT'}</p>
                </div>
              </div>
              <button onClick={() => setTestResultModal(null)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${testResultModal.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'}`}>
              <p className="font-semibold text-sm mb-1 flex items-center gap-1.5">
                {testResultModal.success ? (
                  <><CheckCircle2 size={16} className="text-emerald-400 shrink-0" /> Sinyal Webhook Berhasil Dipicu</>
                ) : (
                  <><AlertCircle size={16} className="text-rose-400 shrink-0" /> Pengiriman Dibatalkan</>
                )}
              </p>
              <p>{testResultModal.message}</p>
            </div>

            {testResultModal.success && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/40">
                  <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">Total Penerima</span>
                  <span className="text-base font-bold text-cyan-400 mt-0.5 block">{testResultModal.recipientsCount} Akun</span>
                  <span className="text-[10px] text-slate-500">Admin & Manajemen</span>
                </div>
                <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/40">
                  <span className="text-[10px] text-slate-400 block font-medium uppercase tracking-wider">Item Pending</span>
                  <span className="text-base font-bold text-amber-400 mt-0.5 block">{testResultModal.totalPending} Item</span>
                  <span className="text-[10px] text-slate-500">{testResultModal.countLaporan} Laporan, {testResultModal.countIzin} Izin</span>
                </div>
              </div>
            )}

            {/* Catatan Diagnostik Email */}
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 text-[11px] text-slate-400 space-y-1.5">
              <span className="font-bold text-slate-300 block flex items-center gap-1.5">
                <Info size={13} className="text-cyan-400 shrink-0" /> Mengapa Email Belum Masuk di Inbox?
              </span>
              <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1 leading-relaxed">
                <li>Periksa folder <strong>Spam / Promosi / Updates</strong> di email penerima.</li>
                <li>Pastikan email pengirim (<code className="text-cyan-300 font-mono">{testResultModal.senderEmail}</code>) terverifikasi di akun Brevo.</li>
                <li>Pastikan server Render (<code className="text-slate-300 font-mono">{testResultModal.webhookUrl?.slice(0, 32)}...</code>) sedang aktif & memiliki API Key Brevo yang valid.</li>
              </ul>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setTestResultModal(null)}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-md"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
