import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getDistanceMeters, formatDistance } from '../lib/geoUtils'
import { 
  Users, CheckCircle, AlertTriangle, Clock, TrendingUp, 
  BarChart3, Timer, UserCheck, Hammer, MapPinOff, ExternalLink, MapPin, X,
  ShieldAlert, Radio, Navigation, Building2, ZoomIn, Eye, ScanFace, Globe
} from 'lucide-react'

const namaBulan = ['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
const namaBulanFull = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const fmt = n => new Intl.NumberFormat('id-ID').format(Math.round(n || 0))
const fmtShort = n => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}jt`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`
  return String(Math.round(n))
}

function TrendChart({ data, chartId, formatValue, renderTooltip, colors, emptyMessage }) {
  const [hover, setHover] = useState(null)

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'var(--text-muted)' }}>
        <TrendingUp size={20} className="mr-2" style={{ color: 'var(--text-muted)' }} />
        {emptyMessage || 'Belum ada data'}
      </div>
    )
  }

  const padX = 52, padR = 16, padT = 20, padB = 32
  const W = 600, H = 220
  const chartW = W - padX - padR
  const chartH = H - padT - padB

  const values = data.map(d => d.value)
  const maxVal = Math.max(...values) || 1
  const magnitude = maxVal >= 10 ? Math.pow(10, Math.floor(Math.log10(maxVal))) : 1
  const ceilVal = Math.ceil(maxVal / magnitude) * magnitude || 1
  const gridLines = 4
  const gridStep = ceilVal / gridLines

  const points = data.map((d, i) => ({
    x: padX + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW),
    y: padT + chartH - (d.value / ceilVal) * chartH,
    ...d,
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x},${padT + chartH} L${points[0].x},${padT + chartH} Z`

  const areaGradId = `areaGrad_${chartId}`
  const lineGradId = `lineGrad_${chartId}`

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 260 }}>
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = padT + chartH - (i * gridStep / ceilVal) * chartH
          return (
            <g key={i}>
              <line x1={padX} y1={y} x2={W - padR} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
              <text x={padX - 6} y={y + 3} textAnchor="end" fill="#475569" fontSize="9" fontFamily="Inter, sans-serif">
                {formatValue ? formatValue(i * gridStep) : fmtShort(i * gridStep)}
              </text>
            </g>
          )
        })}

        <defs>
          <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.start} stopOpacity="0.15" />
            <stop offset="50%" stopColor={colors.mid} stopOpacity="0.08" />
            <stop offset="100%" stopColor={colors.end} stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id={lineGradId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={colors.start} />
            <stop offset="50%" stopColor={colors.mid} />
            <stop offset="100%" stopColor={colors.end} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${areaGradId})`} />
        <path d={linePath} fill="none" stroke={`url(#${lineGradId})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
            <rect x={p.x - 18} y={padT} width={36} height={chartH + padB} fill="transparent" />
            {hover === i && <line x1={p.x} y1={padT} x2={p.x} y2={padT + chartH} stroke={`${colors.mid}4d`} strokeWidth="0.5" strokeDasharray="3,3" />}
            <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 3} fill={hover === i ? colors.start : colors.mid} stroke="rgba(6, 11, 24, 0.8)" strokeWidth="2" />
            {hover === i && <circle cx={p.x} cy={p.y} r="10" fill="none" stroke={`${colors.start}4d`} strokeWidth="1" />}
            <text x={p.x} y={H - 8} textAnchor="middle" fill="#475569" fontSize="9" fontWeight="500" fontFamily="Inter, sans-serif">
              {namaBulan[p.bulan]}
            </text>
          </g>
        ))}
      </svg>

      {hover !== null && points[hover] && (
        <div
          className="absolute rounded-xl px-3.5 py-2.5 text-xs pointer-events-none z-10"
          style={{
            left: `${(points[hover].x / W) * 100}%`,
            top: `${(points[hover].y / H) * 100 - 14}%`,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(6, 11, 24, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="font-semibold text-white mb-1">{namaBulanFull[points[hover].bulan]} {points[hover].tahun || ''}</div>
          {renderTooltip ? renderTooltip(points[hover]) : (
            <div className="font-bold tabular-nums" style={{ color: colors.start }}>{fmt(points[hover].value)}</div>
          )}
        </div>
      )}
    </div>
  )
}

function ChartCard({ icon: Icon, iconColor, iconBg, title, subtitle, summaryLabel, summaryValue, summaryColor, children }) {
  return (
    <div className="rounded-2xl transition-all duration-200 hover:border-blue-500/20" style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}>
      <div className="p-4 sm:p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--card-border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg }}>
            <Icon size={16} style={{ color: iconColor }} />
          </div>
          <div>
            <h2 className="font-semibold text-white text-sm">{title}</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>
          </div>
        </div>
        {summaryValue !== undefined && summaryValue !== null && (
          <div className="text-right hidden sm:block">
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{summaryLabel}</div>
            <div className="font-semibold text-sm tabular-nums" style={{ color: summaryColor }}>{summaryValue}</div>
          </div>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

export default function Dashboard() {
  const now = new Date()
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())
  const [stats, setStats] = useState(null)
  const [salaryTrend, setSalaryTrend] = useState([])
  const [workerTrend, setWorkerTrend] = useState([])
  const [attendanceTrend, setAttendanceTrend] = useState([])
  const [overtimeTrend, setOvertimeTrend] = useState([])
  const [workHoursTrend, setWorkHoursTrend] = useState([])
  const [offsiteScans, setOffsiteScans] = useState([])
  const [siteConfig, setSiteConfig] = useState({ lat: -6.2, lng: 106.816666, radius: 500, nama: 'Site Proyek Utama' })
  const [previewPhoto, setPreviewPhoto] = useState(null)
  const [loading, setLoading] = useState(true)
  const { profile } = useAuth()

  useEffect(() => { loadStats() }, [bulan, tahun])
  useEffect(() => { loadTrends() }, [tahun])

  async function loadStats() {
    setLoading(true)
    const padBulan = String(bulan).padStart(2, '0')
    const startDate = `${tahun}-${padBulan}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const endDate = `${tahun}-${padBulan}-${String(lastDay).padStart(2, '0')}`

    const [statsRes, configRes, scansGpsRes] = await Promise.all([
      supabase.rpc('absen_dashboard_stats', { p_bulan: bulan, p_tahun: tahun }),
      supabase.from('absen_konfigurasi').select('key, value'),
      supabase
        .from('absen_scan_wajah')
        .select('id, karyawan_id, tanggal, slot_id, waktu_scan, client_tz, gps_lat, gps_lng, lokasi_kerja, foto_url, absen_karyawan(nama, jabatan), absen_jadwal_slot(label, jam)')
        .gte('tanggal', startDate)
        .lte('tanggal', endDate)
        .not('gps_lat', 'is', null)
        .not('gps_lng', 'is', null)
        .order('waktu_scan', { ascending: false })
    ])

    if (!statsRes.error && statsRes.data) setStats(statsRes.data)

    const cfgMap = {}
    configRes.data?.forEach(r => { cfgMap[r.key] = r.value })

    const sLat = Number(cfgMap.site_lat || -4.824518)
    const sLng = Number(cfgMap.site_lng || 136.844673)
    const sRadius = Number(cfgMap.site_radius_meter || 400)
    const sNama = cfgMap.site_nama || 'Portsite Accommodation Project'
    const sTz = cfgMap.zona_waktu || 'Asia/Jayapura'

    setSiteConfig({ lat: sLat, lng: sLng, radius: sRadius, nama: sNama, zona_waktu: sTz })

    const offsiteList = []
    scansGpsRes.data?.forEach(s => {
      const dist = getDistanceMeters(s.gps_lat, s.gps_lng, sLat, sLng)
      if (dist > sRadius) {
        offsiteList.push({
          ...s,
          distanceMeters: dist
        })
      }
    })

    setOffsiteScans(offsiteList)
    setLoading(false)
  }

  async function loadTrends() {
    const startDate = `${tahun}-01-01`
    const endDate = `${tahun}-12-31`

    const [gajiResult, harianResult] = await Promise.all([
      supabase.from('absen_gaji_bulanan').select('bulan, total_gaji').eq('tahun', tahun),
      supabase.from('absen_harian').select('tanggal, karyawan_id, jam_masuk, jam_pulang, jam_lembur').gte('tanggal', startDate).lte('tanggal', endDate).limit(50000),
    ])

    const gajiData = gajiResult.data || []
    const gajiGrouped = {}
    gajiData.forEach(d => {
      if (!gajiGrouped[d.bulan]) gajiGrouped[d.bulan] = { total: 0, count: 0 }
      gajiGrouped[d.bulan].total += Number(d.total_gaji || 0)
      gajiGrouped[d.bulan].count += 1
    })
    setSalaryTrend(
      Object.entries(gajiGrouped)
        .map(([b, v]) => ({ bulan: Number(b), value: v.total, count: v.count }))
        .sort((a, b) => a.bulan - b.bulan)
    )

    const harianData = harianResult.data || []
    const monthData = {}
    const parseTime = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h + m / 60 }
    harianData.forEach(d => {
      const m = parseInt(d.tanggal.split('-')[1], 10)
      if (!monthData[m]) monthData[m] = { workers: new Set(), attendance: 0, lembur: 0, lemburCount: 0, workHours: 0, workDays: 0 }
      monthData[m].workers.add(d.karyawan_id)
      monthData[m].attendance += 1
      const jam = Number(d.jam_lembur || 0)
      if (jam > 0) {
        monthData[m].lembur += jam
        monthData[m].lemburCount += 1
      }
      const masuk = parseTime(d.jam_masuk)
      const pulang = parseTime(d.jam_pulang)
      if (masuk !== null && pulang !== null && pulang > masuk) {
        monthData[m].workHours += pulang - masuk
        monthData[m].workDays += 1
      }
    })

    const months = Object.entries(monthData)
      .map(([b, v]) => ({ bulan: Number(b), workers: v.workers.size, attendance: v.attendance, lembur: v.lembur, lemburCount: v.lemburCount, workHours: Math.round(v.workHours * 10) / 10, workDays: v.workDays }))
      .sort((a, b) => a.bulan - b.bulan)

    setWorkerTrend(months.map(d => ({ bulan: d.bulan, value: d.workers })))
    setAttendanceTrend(months.map(d => ({ bulan: d.bulan, value: d.attendance, workers: d.workers })))
    setOvertimeTrend(months.map(d => ({ bulan: d.bulan, value: d.lembur, count: d.lemburCount })))
    setWorkHoursTrend(months.map(d => ({ bulan: d.bulan, value: d.workHours, days: d.workDays })))
  }

  const cards = stats ? [
    { label: 'KARYAWAN AKTIF', value: stats.total_karyawan, desc: 'Total karyawan aktif terdaftar', icon: Users, color: 'blue', iconColor: '#3b82f6', iconBg: 'rgba(59, 130, 246, 0.12)' },
    { label: 'HARI LENGKAP', value: stats.total_lengkap, desc: 'Absensi lengkap bulan ini', icon: CheckCircle, color: 'green', iconColor: '#10b981', iconBg: 'rgba(16, 185, 129, 0.12)' },
    { label: 'PERLU KOREKSI', value: stats.total_perlu_koreksi, desc: 'Data absensi perlu diperbaiki', icon: AlertTriangle, color: 'red', iconColor: '#ef4444', iconBg: 'rgba(239, 68, 68, 0.12)' },
    { label: 'LEMBUR PENDING', value: stats.total_lembur_pending, desc: 'Menunggu approval atasan', icon: Clock, color: 'orange', iconColor: '#f97316', iconBg: 'rgba(249, 115, 22, 0.12)' },
  ] : []

  const salaryTotal = salaryTrend.reduce((s, d) => s + d.value, 0)
  const workerAvg = workerTrend.length > 0 ? Math.round(workerTrend.reduce((s, d) => s + d.value, 0) / workerTrend.length) : 0
  const attendanceTotal = attendanceTrend.reduce((s, d) => s + d.value, 0)
  const overtimeTotal = overtimeTrend.reduce((s, d) => s + d.value, 0)

  const chartColors = {
    salary: { start: '#06b6d4', mid: '#0891b2', end: '#164e63' },
    workers: { start: '#10b981', mid: '#059669', end: '#064e3b' },
    attendance: { start: '#3b82f6', mid: '#2563eb', end: '#1e3a8a' },
    overtime: { start: '#f97316', mid: '#ea580c', end: '#7c2d12' },
  }

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="page-title">Dashboard Absensi</h1>
          {profile?.role && <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>{profile.role === 'admin' ? 'Admin' : profile.role}</span>}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="text-sm hidden sm:block" style={{ color: 'var(--text-muted)' }}>Periode:</span>
          <select value={bulan} onChange={e => setBulan(+e.target.value)} className="select-field">
            {namaBulanFull.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
          </select>
          <select value={tahun} onChange={e => setTahun(+e.target.value)} className="select-field">
            {Array.from({ length: new Date().getFullYear() - 2024 + 3 }, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="main-content">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(59, 130, 246, 0.2)', borderTopColor: '#3b82f6' }} />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid-kpi mb-6 lg:mb-8">
            {cards.map((c, i) => {
              const Icon = c.icon
              return (
                <div key={i} className={`kpi-card kpi-card--${c.color}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-[11px] font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>{c.label}</div>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: c.iconBg }}>
                      <Icon className="w-[18px] h-[18px]" style={{ color: c.iconColor }} />
                    </div>
                  </div>
                  <div className="kpi-value text-[1.75rem] sm:text-[2rem] lg:text-[2.5rem] font-bold leading-none text-white">{c.value}</div>
                  <div className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>{c.desc}</div>
                </div>
              )
            })}
          </div>

          {/* Alert Anomali Massal */}
          {stats?.total_insiden > 0 && (
            <div className="rounded-xl p-4 mb-6 lg:mb-8" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
                  <AlertTriangle size={18} style={{ color: '#f87171' }} />
                </div>
                <div>
                  <div className="font-semibold" style={{ color: '#fca5a5' }}>Anomali Massal Terdeteksi</div>
                  <p className="text-sm mt-1" style={{ color: '#f87171' }}>
                    Terdapat {stats.total_insiden} insiden anomali pada bulan ini. Periksa halaman Rekap Harian untuk detail.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Card List Karyawan Absen dari Luar Lokasi Site */}
          <div className="relative rounded-2xl mb-6 lg:mb-8 overflow-hidden border border-rose-500/30 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950/95 backdrop-blur-xl shadow-2xl shadow-rose-950/20">
            {/* Ambient Top Glow Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500" />

            <div className="px-6 py-4.5 border-b border-rose-500/20 flex items-center justify-between flex-wrap gap-4 bg-slate-900/40">
              <div className="flex items-center gap-3.5">
                <div className="relative w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 shadow-lg shadow-rose-950/40">
                  <MapPinOff size={22} />
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </span>
                </div>
                <div>
                  <h2 className="font-extrabold text-white text-base tracking-wide flex items-center gap-2.5 flex-wrap">
                    <span>Presensi Di Luar Lokasi Site Proyek</span>
                    {offsiteScans.length > 0 && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/10 flex items-center gap-1.5">
                        <ShieldAlert size={13} className="text-rose-400" />
                        <span>{offsiteScans.length} Scan Terdeteksi</span>
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                    <span>Radius Geofence Site:</span>
                    <span className="font-mono font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded text-[11px] inline-flex items-center gap-1">
                      🎯 {siteConfig.radius} Meter ({siteConfig.lat?.toFixed(5)}, {siteConfig.lng?.toFixed(5)})
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {offsiteScans.length === 0 ? (
              <div className="p-8 text-center text-xs flex items-center justify-center gap-2.5 text-slate-400">
                <CheckCircle size={18} className="text-emerald-400" />
                <span className="font-medium text-slate-300">Seluruh presensi scan bulan ini dilakukan di dalam radius lokasi site proyek ({siteConfig.radius}m).</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="uppercase tracking-wider font-semibold text-slate-400 bg-slate-950/70 border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3.5">Nama Pekerja</th>
                      <th className="px-5 py-3.5">Waktu Scan & Slot</th>
                      <th className="px-5 py-3.5">Jarak dari Site</th>
                      <th className="px-5 py-3.5">Koordinat GPS</th>
                      <th className="px-5 py-3.5 text-center">Foto Scan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {offsiteScans.map(item => {
                      const scanTz = item.client_tz || siteConfig.zona_waktu || 'Asia/Jayapura'
                      const tzShortMap = { 'Asia/Jayapura': 'WIT', 'Asia/Jakarta': 'WIB', 'Asia/Makassar': 'WITA' }
                      const tzShort = tzShortMap[scanTz] || (scanTz.split('/').pop().replace(/_/g, ' '))
                      const scanTime = new Date(item.waktu_scan)
                      const tglStr = scanTime.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: scanTz })
                      const jamStr = scanTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: scanTz })
                      const isFarOffsite = item.distanceMeters >= 50000

                      return (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-cyan-400 text-xs shrink-0 shadow-inner">
                                {item.absen_karyawan?.nama ? item.absen_karyawan.nama.charAt(0).toUpperCase() : '?'}
                              </div>
                              <div>
                                <div className="font-bold text-white text-sm">{item.absen_karyawan?.nama}</div>
                                <div className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] bg-slate-800/90 border border-slate-700/80 text-cyan-300 font-semibold">
                                  {item.absen_karyawan?.jabatan || 'Pekerja'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 font-mono">
                            <div className="text-cyan-300 font-bold text-xs bg-cyan-950/40 border border-cyan-800/40 px-2.5 py-1 rounded-lg w-fit shadow-inner">
                              {tglStr} • {jamStr} {tzShort}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                              <Clock size={11} className="text-slate-500" />
                              <span>{item.absen_jadwal_slot?.label || 'Presensi'} ({item.absen_jadwal_slot?.jam?.slice(0,5)})</span>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            {isFarOffsite ? (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold text-xs shadow-md shadow-rose-950/50">
                                <Radio size={13} className="text-rose-400 animate-pulse" />
                                <span>{formatDistance(item.distanceMeters)}</span>
                                <span className="text-[9px] bg-rose-950/80 px-1.5 py-0.2 rounded text-rose-300 uppercase font-semibold">Out of Region</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-xs shadow-md shadow-amber-950/50">
                                <AlertTriangle size={13} className="text-amber-400" />
                                <span>{formatDistance(item.distanceMeters)}</span>
                                <span className="text-[9px] bg-amber-950/80 px-1.5 py-0.2 rounded text-amber-300 uppercase font-semibold">Area Sekitar</span>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4 font-mono text-[11px]">
                            <div className="flex flex-col gap-1">
                              <a
                                href={`https://maps.google.com/?q=${item.gps_lat},${item.gps_lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-400 hover:text-blue-300 font-semibold text-xs inline-flex items-center gap-1.5 bg-blue-950/40 border border-blue-800/40 px-2.5 py-1 rounded-lg w-fit transition-colors"
                              >
                                <Navigation size={12} className="text-blue-400 shrink-0" />
                                <span>{item.gps_lat?.toFixed(5)}, {item.gps_lng?.toFixed(5)}</span>
                                <ExternalLink size={11} className="opacity-70" />
                              </a>
                              {item.lokasi_kerja && (
                                <div className="text-[11px] font-sans text-slate-400 flex items-center gap-1 px-1">
                                  <Building2 size={11} className="text-slate-500 shrink-0" />
                                  <span>{item.lokasi_kerja}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center">
                            {item.foto_url ? (
                              <div className="flex justify-center">
                                <button
                                  onClick={() => setPreviewPhoto(item.foto_url)}
                                  className="relative group overflow-hidden rounded-xl border border-slate-700 hover:border-cyan-500/80 transition-all shadow-md"
                                  title="Klik untuk perbesar foto"
                                >
                                  <img src={item.foto_url} alt="Scan" className="w-10 h-10 object-cover transition-transform group-hover:scale-110" />
                                  <div className="absolute inset-0 bg-slate-950/50 group-hover:bg-slate-950/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Eye size={16} className="text-cyan-300 drop-shadow-md" />
                                  </div>
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Trend Charts 2x2 Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            <ChartCard
              icon={TrendingUp}
              iconColor="#06b6d4"
              iconBg="rgba(6, 182, 212, 0.1)"
              title="Trend Gaji Bulanan"
              subtitle={`Total pengeluaran gaji — ${tahun}`}
              summaryLabel={`Total ${tahun}`}
              summaryValue={salaryTrend.length > 0 ? `Rp ${fmt(salaryTotal)}` : null}
              summaryColor="#67e8f9"
            >
              <TrendChart
                data={salaryTrend}
                chartId="salary"
                colors={chartColors.salary}
                emptyMessage="Belum ada data gaji"
                renderTooltip={p => (
                  <>
                    <div className="tabular-nums" style={{ color: '#67e8f9' }}>Rp {fmt(p.value)}</div>
                    <div style={{ color: '#475569' }}>{p.count} karyawan</div>
                  </>
                )}
              />
            </ChartCard>

            <ChartCard
              icon={UserCheck}
              iconColor="#10b981"
              iconBg="rgba(16, 185, 129, 0.1)"
              title="Trend Jumlah Pekerja"
              subtitle={`Pekerja aktif per bulan — ${tahun}`}
              summaryLabel="Rata-rata"
              summaryValue={workerTrend.length > 0 ? `${workerAvg} pekerja` : null}
              summaryColor="#6ee7b7"
            >
              <TrendChart
                data={workerTrend}
                chartId="workers"
                colors={chartColors.workers}
                formatValue={v => String(Math.round(v))}
                emptyMessage="Belum ada data pekerja"
                renderTooltip={p => (
                  <div className="tabular-nums" style={{ color: '#6ee7b7' }}>{p.value} pekerja</div>
                )}
              />
            </ChartCard>

            <ChartCard
              icon={BarChart3}
              iconColor="#3b82f6"
              iconBg="rgba(59, 130, 246, 0.1)"
              title="Trend Absensi"
              subtitle={`Total hari kehadiran — ${tahun}`}
              summaryLabel={`Total ${tahun}`}
              summaryValue={attendanceTrend.length > 0 ? `${fmt(attendanceTotal)} hari` : null}
              summaryColor="#93c5fd"
            >
              <TrendChart
                data={attendanceTrend}
                chartId="attendance"
                colors={chartColors.attendance}
                emptyMessage="Belum ada data absensi"
                renderTooltip={p => (
                  <>
                    <div className="tabular-nums" style={{ color: '#93c5fd' }}>{fmt(p.value)} hari hadir</div>
                    <div style={{ color: '#475569' }}>{p.workers} pekerja aktif</div>
                  </>
                )}
              />
            </ChartCard>

            <ChartCard
              icon={Timer}
              iconColor="#f97316"
              iconBg="rgba(249, 115, 22, 0.1)"
              title="Trend Lembur"
              subtitle={`Total jam lembur — ${tahun}`}
              summaryLabel={`Total ${tahun}`}
              summaryValue={overtimeTrend.length > 0 ? `${fmt(overtimeTotal)} jam` : null}
              summaryColor="#fdba74"
            >
              <TrendChart
                data={overtimeTrend}
                chartId="overtime"
                colors={chartColors.overtime}
                emptyMessage="Belum ada data lembur"
                renderTooltip={p => (
                  <>
                    <div className="tabular-nums" style={{ color: '#fdba74' }}>{fmt(p.value)} jam lembur</div>
                    <div style={{ color: '#475569' }}>{p.count} kali lembur</div>
                  </>
                )}
              />
            </ChartCard>
          </div>
        </>
      )}
      </div>

      {/* Modal Preview Foto */}
      {previewPhoto && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 max-w-md w-full space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Foto Evidence Scan Presensi</span>
              <button onClick={() => setPreviewPhoto(null)} className="p-1 text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <img src={previewPhoto} alt="Evidence" className="w-full h-80 object-cover rounded-2xl border border-slate-800" />
            <button onClick={() => setPreviewPhoto(null)} className="w-full py-2 bg-slate-800 text-xs font-bold text-slate-200 rounded-xl">
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
