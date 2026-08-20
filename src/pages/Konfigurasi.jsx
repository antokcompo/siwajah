import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Save, Clock, Timer, AlertTriangle, Shield, CheckCircle, RotateCcw, ChevronDown, ChevronUp, Info, Globe, Mail } from 'lucide-react'

const timezoneOptions = [
  { value: 'Asia/Jakarta', label: 'WIB — Waktu Indonesia Barat (UTC+7)' },
  { value: 'Asia/Makassar', label: 'WITA — Waktu Indonesia Tengah (UTC+8)' },
  { value: 'Asia/Jayapura', label: 'WIT — Waktu Indonesia Timur (UTC+9)' },
]

const sections = [
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
    title: 'Notifikasi Email (Brevo)',
    icon: Mail,
    color: 'indigo',
    description: 'Pengaturan email notifikasi otomatis. API Key Brevo dikonfigurasi di Render.',
    fields: [
      { key: 'email_webhook_url', label: 'URL Webhook Email', type: 'text', default: '', help: 'Endpoint Render API (contoh: https://siwajah-api.onrender.com/api/notify-lembur)' },
      { key: 'email_sender_name', label: 'Nama Pengirim', type: 'text', default: 'SI WAJAH', help: 'Nama yang tampil sebagai pengirim email' },
      { key: 'email_sender_email', label: 'Email Pengirim', type: 'text', default: '', help: 'Harus email yang sudah terverifikasi di akun Brevo' },
      { key: 'app_url', label: 'URL Aplikasi', type: 'text', default: '', help: 'URL SI WAJAH untuk link di email (contoh: https://siwajah.example.com)' },
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

  useEffect(() => { load() }, [])

  async function handleTestDigest() {
    setTesting(true)
    try {
      const { data, error } = await supabase.rpc('absen_kirim_digest_pending_approval')
      if (error) throw error
      if (data?.sent) {
        alert(`Berhasil! Email digest pending approval terkirim ke ${data.recipients_count} penerima (${data.total_pending} item pending).`)
      } else {
        alert(`Email tidak dikirim: ${data?.reason || 'Tidak ada data pending'}`)
      }
    } catch (err) {
      alert(`Gagal: ${err.message}`)
    } finally {
      setTesting(false)
    }
  }

  async function load() {
    setLoading(true)
    setError('')

    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('absen_get_konfigurasi')
      if (!rpcErr && rpcData) {
        const parsed = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
          const merged = { ...defaultValues, ...parsed }
          setValues(merged)
          setOrigValues(merged)
          setChanged({})
          setLoading(false)
          return
        }
      }
    } catch {}

    const { data, error: err } = await supabase
      .from('absen_konfigurasi')
      .select('key, value')

    if (err) {
      setError('Gagal memuat konfigurasi: ' + err.message)
      setLoading(false)
      return
    }

    const map = { ...defaultValues }
    if (data) data.forEach(d => { if (d.value) map[d.key] = d.value })
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

    const payload = {}
    allFields.forEach(f => {
      if (values[f.key] !== undefined && values[f.key] !== '') payload[f.key] = values[f.key]
    })

    try {
      const { error: rpcErr } = await supabase.rpc('absen_save_konfigurasi', { p_data: payload })
      if (!rpcErr) {
        setSaved(true)
        setOrigValues({ ...values })
        setChanged({})
        setTimeout(() => setSaved(false), 3000)
        setSaving(false)
        return
      }
    } catch {}

    const rows = allFields
      .filter(f => values[f.key] !== undefined && values[f.key] !== '')
      .map(f => ({
        key: f.key,
        value: values[f.key],
        deskripsi: f.label,
        updated_at: new Date().toISOString(),
      }))

    const { error: err } = await supabase
      .from('absen_konfigurasi')
      .upsert(rows, { onConflict: 'key' })

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

              <div className={`transition-all duration-300 ease-in-out ${isCollapsed ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-[600px] opacity-100'}`}>
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

                  {section.id === 'email' && (
                    <div className="mt-4 pt-3 border-t flex justify-end">
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
    </div>
  )
}
