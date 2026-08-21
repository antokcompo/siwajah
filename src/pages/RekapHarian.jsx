import { useEffect, useState, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Calendar, ScanFace, MapPin, MapPinOff, Clock, X, Image as ImageIcon, ExternalLink, ZoomIn, AlertTriangle, CheckCircle, Search } from 'lucide-react'
import { getDistanceMeters, formatDistance } from '../lib/geoUtils'

const statusColor = {
  LENGKAP: 'bg-emerald-100 text-emerald-700 font-semibold',
  TIDAK_LENGKAP: 'bg-amber-100 text-amber-700 font-semibold',
  TANPA_PULANG: 'bg-amber-100 text-amber-700',
  TANPA_MASUK: 'bg-amber-100 text-amber-700',
  HANYA_SCAN_TENGAH: 'bg-orange-100 text-orange-700',
  TIDAK_ADA_SCAN: 'bg-gray-100 text-gray-500',
  INSIDEN: 'bg-red-100 text-red-700',
  IZIN_BERBAYAR: 'bg-cyan-100 text-cyan-700',
  IZIN_TIDAK_BERBAYAR: 'bg-slate-100 text-slate-600',
  LAPORAN_DITERIMA: 'bg-blue-100 text-blue-700',
}

const statusLabel = {
  LENGKAP: 'Lengkap',
  TIDAK_LENGKAP: 'Tidak Lengkap',
  TANPA_PULANG: 'Tanpa Pulang',
  TANPA_MASUK: 'Tanpa Masuk',
  HANYA_SCAN_TENGAH: 'Scan Tengah',
  TIDAK_ADA_SCAN: 'Tidak Ada',
  INSIDEN: 'Insiden',
  IZIN_BERBAYAR: 'Izin Berbayar',
  IZIN_TIDAK_BERBAYAR: 'Izin Tidak Berbayar',
  LAPORAN_DITERIMA: 'Laporan Diterima',
}

const slotColor = {
  masuk: 'bg-emerald-500',
  progress: 'bg-blue-500',
  istirahat: 'bg-slate-500',
  pulang: 'bg-amber-500',
  lembur: 'bg-red-500',
  pulang_lembur: 'bg-purple-500',
}

const tzShortName = {
  'Asia/Jakarta': 'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Bangkok': 'WIB',
  'Asia/Phnom_Penh': 'WIB',
  'Asia/Ho_Chi_Minh': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Denpasar': 'WITA',
  'Asia/Singapore': 'WITA',
  'Asia/Kuala_Lumpur': 'WITA',
  'Asia/Jayapura': 'WIT',
  'Asia/Ambon': 'WIT',
}

function getTzLabel(tz) {
  if (!tz) return 'WIB'
  if (tzShortName[tz]) return tzShortName[tz]
  if (tz.includes('Bangkok') || tz.includes('Jakarta') || tz.includes('Pontianak') || tz.includes('WIB') || tz.includes('+07') || tz.includes('-7')) return 'WIB'
  if (tz.includes('Makassar') || tz.includes('Denpasar') || tz.includes('Singapore') || tz.includes('WITA') || tz.includes('+08') || tz.includes('-8')) return 'WITA'
  if (tz.includes('Jayapura') || tz.includes('Ambon') || tz.includes('WIT') || tz.includes('+09') || tz.includes('-9')) return 'WIT'
  return 'WIB'
}

function confidenceLevel(c) {
  if (c >= 0.75) return { label: 'Tinggi', cls: 'text-emerald-600' }
  if (c >= 0.55) return { label: 'Sedang', cls: 'text-amber-600' }
  return { label: 'Rendah', cls: 'text-red-600' }
}

function formatScanTime(waktu, tz) {
  const d = new Date(waktu)
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: tz })
  const label = getTzLabel(tz)
  return label ? `${time} ${label}` : time
}

function formatScanTimeFull(waktu, tz) {
  const d = new Date(waktu)
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz })
  const label = getTzLabel(tz)
  return label ? `${time} ${label}` : time
}

export default function RekapHarian() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [data, setData] = useState([])
  const [detail, setDetail] = useState([])
  const [scanData, setScanData] = useState([])
  const [mandorMap, setMandorMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('semua')
  const [searchQuery, setSearchQuery] = useState('')
  const [slotMaster, setSlotMaster] = useState([])
  const [laporanData, setLaporanData] = useState([])
  const [selectedScan, setSelectedScan] = useState(null)
  const [zoomPhoto, setZoomPhoto] = useState(null)
  const [projectTz, setProjectTz] = useState('Asia/Jayapura')
  const [siteConfig, setSiteConfig] = useState({ lat: -4.824518, lng: 136.844673, radius: 400 })

  const bulan = currentDate.getMonth() + 1
  const tahun = currentDate.getFullYear()

  useEffect(() => {
    loadTimezone()
    loadSlots()
  }, [])

  useEffect(() => { loadMonth() }, [bulan, tahun])
  useEffect(() => {
    if (selectedDate) {
      loadDetail(selectedDate)
      loadScanWajah(selectedDate)
    }
  }, [selectedDate, filter])

  async function loadSlots() {
    const { data } = await supabase
      .from('absen_jadwal_slot')
      .select('*')
      .eq('aktif', true)
      .order('urutan', { ascending: true })
    setSlotMaster(data || [])
  }

  async function loadTimezone() {
    const { data: configData } = await supabase
      .from('absen_konfigurasi')
      .select('key, value')
    if (configData) {
      const map = {}
      configData.forEach(r => { map[r.key] = r.value })
      if (map.zona_waktu) setProjectTz(map.zona_waktu)
      setSiteConfig({
        lat: Number(map.site_lat || -4.824518),
        lng: Number(map.site_lng || 136.844673),
        radius: Number(map.site_radius_meter || 400)
      })
    }
  }

  async function loadMonth() {
    setLoading(true)
    const start = format(startOfMonth(currentDate), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentDate), 'yyyy-MM-dd')
    const [rpcRes, mandorRes] = await Promise.all([
      supabase.rpc('absen_list_harian_bulan', { p_start: start, p_end: end }),
      supabase.from('absen_karyawan').select('id, nama').ilike('jabatan', '%mandor%').eq('status_aktif', true),
    ])
    if (rpcRes.error) {
      const { data: fallback } = await supabase
        .from('absen_harian')
        .select('tanggal, status, is_insiden')
        .gte('tanggal', start)
        .lte('tanggal', end)
      setData(fallback || [])
    } else {
      setData(rpcRes.data || [])
    }
    const mMap = {}
    ;(mandorRes.data || []).forEach(m => { mMap[m.id] = m.nama })
    setMandorMap(mMap)
    setLoading(false)
  }

  async function loadDetail(date) {
    const params = { p_tanggal: date }
    if (filter !== 'semua') params.p_status = filter

    const [rpcRes, scanRes, laporanRes] = await Promise.all([
      supabase.rpc('absen_detail_harian', params),
      supabase
        .from('absen_scan_wajah')
        .select('karyawan_id, slot_id, absen_jadwal_slot(jenis)')
        .eq('tanggal', date),
      supabase
        .from('absen_laporan_terlewat')
        .select('karyawan_id, slot_id, status, absen_jadwal_slot(jenis)')
        .eq('tanggal', date)
        .eq('status', 'APPROVED')
    ])

    const slotCounts = {}
    ;(scanRes.data || []).forEach(s => {
      const j = (s.absen_jadwal_slot?.jenis || '').toLowerCase()
      const l = (s.absen_jadwal_slot?.label || '').toLowerCase()
      if (!j.includes('lembur') && !l.includes('lembur')) {
        if (!slotCounts[s.karyawan_id]) slotCounts[s.karyawan_id] = new Set()
        slotCounts[s.karyawan_id].add(s.slot_id)
      }
    })
    ;(laporanRes.data || []).forEach(l => {
      const j = (l.absen_jadwal_slot?.jenis || '').toLowerCase()
      const lbl = (l.absen_jadwal_slot?.label || '').toLowerCase()
      if (!j.includes('lembur') && !lbl.includes('lembur')) {
        if (!slotCounts[l.karyawan_id]) slotCounts[l.karyawan_id] = new Set()
        slotCounts[l.karyawan_id].add(l.slot_id)
      }
    })

    let rawList = []
    if (rpcRes.error) {
      let q = supabase
        .from('absen_harian')
        .select('*, absen_karyawan(nama, jabatan, atasan_id)')
        .eq('tanggal', date)
      if (filter !== 'semua') q = q.eq('status', filter)
      const { data: fallback } = await q
      rawList = fallback || []
    } else {
      rawList = (rpcRes.data || []).map(d => ({
        ...d,
        absen_karyawan: { nama: d.karyawan_nama, jabatan: d.karyawan_jabatan, atasan_id: d.atasan_id }
      }))
    }

    const enriched = rawList.map(item => {
      const kid = item.karyawan_id || item.absen_karyawan?.id
      const vSlots = slotCounts[kid] ? slotCounts[kid].size : 0
      let computedStatus = item.status
      if (item.jam_masuk && item.jam_pulang) {
        if (vSlots < 6) {
          computedStatus = 'TIDAK_LENGKAP'
        } else {
          computedStatus = 'LENGKAP'
        }
      }
      return {
        ...item,
        verifiedSlots: vSlots,
        computedStatus
      }
    })

    setDetail(enriched)
  }

  async function loadScanWajah(date) {
    const [scanRes, laporanRes] = await Promise.all([
      supabase
        .from('absen_scan_wajah')
        .select('*, absen_karyawan(id, nama, jabatan, atasan_id), absen_jadwal_slot(label, jam, jenis)')
        .eq('tanggal', date)
        .order('waktu_scan', { ascending: true }),
      supabase
        .from('absen_laporan_terlewat')
        .select('*, absen_karyawan(id, nama, jabatan, atasan_id), absen_jadwal_slot(label, jam, jenis)')
        .eq('tanggal', date)
        .eq('status', 'APPROVED')
    ])
    setScanData(scanRes.data || [])
    setLaporanData(laporanRes.data || [])
  }

  function prevMonth() { setCurrentDate(new Date(tahun, bulan - 2, 1)); setSelectedDate(null); setScanData([]) }
  function nextMonth() { setCurrentDate(new Date(tahun, bulan, 1)); setSelectedDate(null); setScanData([]) }

  const days = eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) })

  function getDayStatus(date) {
    const ds = format(date, 'yyyy-MM-dd')
    const dayData = data.filter(d => d.tanggal === ds)
    if (dayData.length === 0) return 'empty'
    if (dayData.some(d => d.is_insiden)) return 'insiden'
    if (dayData.every(d => d.status === 'LENGKAP')) return 'ok'
    return 'koreksi'
  }

  const dayStatusColor = { ok: 'bg-emerald-500', koreksi: 'bg-amber-500', insiden: 'bg-red-500', empty: 'bg-gray-200' }

  const groupedDetail = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const groups = {}
    detail.forEach(d => {
      const atasanId = d.absen_karyawan?.atasan_id
      const groupName = atasanId && mandorMap[atasanId] ? mandorMap[atasanId] : 'Harian Kantor'
      const nama = (d.absen_karyawan?.nama || '').toLowerCase()
      const jabatan = (d.absen_karyawan?.jabatan || '').toLowerCase()
      const mandorLow = groupName.toLowerCase()

      if (q) {
        const matchNama = nama.includes(q)
        const matchJabatan = jabatan.includes(q)
        const matchMandor = mandorLow.includes(q)
        if (!matchNama && !matchJabatan && !matchMandor) return
      }

      if (!groups[groupName]) groups[groupName] = []
      groups[groupName].push(d)
    })
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Harian Kantor') return 1
      if (b === 'Harian Kantor') return -1
      return a.localeCompare(b)
    })
  }, [detail, mandorMap, searchQuery])

  const groupedScans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const regSlots = slotMaster.filter(s => {
      const j = (s.jenis || '').toLowerCase()
      const l = (s.label || '').toLowerCase()
      return !j.includes('lembur') && !l.includes('lembur')
    })

    const workerMap = {}

    detail.forEach(d => {
      const k = d.absen_karyawan
      if (!k) return
      const kid = d.karyawan_id || k.id
      const atasanId = k.atasan_id
      const groupName = atasanId && mandorMap[atasanId] ? mandorMap[atasanId] : 'Harian Kantor'
      if (!workerMap[kid]) {
        workerMap[kid] = { karyawan: k, groupName, scans: [], lapors: [], computedStatus: d.computedStatus || d.status, verifiedSlots: d.verifiedSlots || 0 }
      }
    })

    scanData.forEach(s => {
      const k = s.absen_karyawan
      if (!k) return
      const kid = s.karyawan_id || k.id
      const atasanId = k.atasan_id
      const groupName = atasanId && mandorMap[atasanId] ? mandorMap[atasanId] : 'Harian Kantor'
      if (!workerMap[kid]) {
        workerMap[kid] = { karyawan: k, groupName, scans: [], lapors: [], computedStatus: 'PRO_RATA', verifiedSlots: 0 }
      }
      workerMap[kid].scans.push(s)
    })

    laporanData.forEach(l => {
      const k = l.absen_karyawan
      if (!k) return
      const kid = l.karyawan_id || k.id
      const atasanId = k.atasan_id
      const groupName = atasanId && mandorMap[atasanId] ? mandorMap[atasanId] : 'Harian Kantor'
      if (!workerMap[kid]) {
        workerMap[kid] = { karyawan: k, groupName, scans: [], lapors: [], computedStatus: 'PRO_RATA', verifiedSlots: 0 }
      }
      workerMap[kid].lapors.push(l)
    })

    const mandorGroups = {}
    Object.values(workerMap).forEach(w => {
      const nama = w.karyawan.nama || 'Unknown'
      const namaLow = nama.toLowerCase()
      const jabatanLow = (w.karyawan.jabatan || '').toLowerCase()
      const groupName = w.groupName
      const mandorLow = groupName.toLowerCase()

      if (q) {
        const matchNama = namaLow.includes(q)
        const matchJabatan = jabatanLow.includes(q)
        const matchMandor = mandorLow.includes(q)
        if (!matchNama && !matchJabatan && !matchMandor) return
      }

      if (filter !== 'semua') {
        const st = w.computedStatus
        if (filter === 'LENGKAP' && st !== 'LENGKAP') return
        if (filter === 'TIDAK_LENGKAP' && st !== 'TIDAK_LENGKAP') return
      }

      if (!mandorGroups[groupName]) mandorGroups[groupName] = []

      const scannedSlotIds = new Set(w.scans.map(s => s.slot_id))
      const laporSlotIds = new Set(w.lapors.map(l => l.slot_id))

      const timelineItems = []

      regSlots.forEach(slot => {
        const matchingScans = w.scans.filter(s => s.slot_id === slot.id)
        if (matchingScans.length > 0) {
          matchingScans.forEach(s => timelineItems.push({ type: 'scan', data: s, slot }))
        } else if (laporSlotIds.has(slot.id)) {
          const laporObj = w.lapors.find(l => l.slot_id === slot.id)
          timelineItems.push({ type: 'lapor', data: laporObj, slot })
        } else {
          timelineItems.push({ type: 'terlewat', slot })
        }
      })

      w.scans.forEach(s => {
        const j = (s.absen_jadwal_slot?.jenis || '').toUpperCase()
        if (j === 'LEMBUR' || j === 'PULANG_LEMBUR') {
          timelineItems.push({ type: 'scan', data: s, slot: s.absen_jadwal_slot })
        }
      })

      mandorGroups[groupName].push({
        id: w.karyawan.id,
        nama,
        karyawan: w.karyawan,
        timelineItems,
        computedStatus: w.computedStatus,
        verifiedCount: scannedSlotIds.size + laporSlotIds.size
      })
    })

    return Object.entries(mandorGroups)
      .sort(([a], [b]) => {
        if (a === 'Harian Kantor') return 1
        if (b === 'Harian Kantor') return -1
        return a.localeCompare(b)
      })
      .map(([groupName, workers]) => ({
        groupName,
        workers: workers.sort((a, b) => a.nama.localeCompare(b.nama)),
      }))
  }, [detail, scanData, laporanData, slotMaster, mandorMap, searchQuery, filter])

  const namaBulan = format(currentDate, 'MMMM yyyy', { locale: localeId })
  const projectTzLabel = tzShortName[projectTz] || projectTz

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rekap Harian</h1>
          <p className="text-gray-500 text-xs mt-0.5">Lihat detail absensi per hari</p>
        </div>
      </div>

      <div className="main-content">
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft size={18} className="text-gray-600" />
            </button>
            <span className="font-semibold capitalize text-gray-900">{namaBulan}</span>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight size={18} className="text-gray-600" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            {['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(d => <div key={d} className="py-1.5">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: getDay(startOfMonth(currentDate)) }).map((_, i) => <div key={`e${i}`} />)}
            {days.map(day => {
              const ds = format(day, 'yyyy-MM-dd')
              const st = getDayStatus(day)
              const isSelected = selectedDate === ds
              return (
                <button
                  key={ds}
                  onClick={() => setSelectedDate(ds)}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-all duration-150
                    ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}
                >
                  <span className="font-medium text-gray-700">{day.getDate()}</span>
                  <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${dayStatusColor[st]}`} />
                </button>
              )
            })}
          </div>
          <div className="flex gap-4 mt-5 pt-4 border-t border-gray-100 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500" /> OK</span>
            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" /> Koreksi</span>
            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500" /> Insiden</span>
          </div>
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-6">
          {selectedDate ? (
            <div className="card overflow-hidden border border-slate-800">
              {/* Single Unified Header */}
              <div className="px-5 py-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/90">
                <div className="flex items-center gap-2 font-bold text-white text-base shrink-0">
                  <ScanFace size={20} className="text-cyan-400 animate-pulse" />
                  <span>{format(new Date(selectedDate + 'T00:00'), 'EEEE, d MMMM yyyy', { locale: localeId })}</span>
                </div>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 flex-1 max-w-lg">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Cari nama pekerja / mandor..."
                      className="input-field pl-9 text-xs py-1.5 font-medium bg-slate-950 border-slate-800 text-white placeholder-slate-500"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-white">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <select value={filter} onChange={e => setFilter(e.target.value)} className="select-field text-xs py-1.5 font-semibold bg-slate-950 border-slate-800 text-slate-200">
                    <option value="semua">Semua Status</option>
                    <option value="LENGKAP">Lengkap (6/6 Slot)</option>
                    <option value="TIDAK_LENGKAP">Tidak Lengkap (&lt; 6 Slot)</option>
                  </select>
                </div>
              </div>

              {groupedScans.length > 0 ? (
                <div className="divide-y divide-slate-800/60">
                  {groupedScans.map(({ groupName, workers }) => (
                    <Fragment key={groupName}>
                      <div className="px-5 py-2.5 bg-slate-950/80 border-t border-b border-slate-800/80 flex items-center justify-between">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-wider">{groupName}</span>
                        <span className="text-xs font-mono text-slate-500">{workers.length} orang</span>
                      </div>
                      {workers.map(w => {
                        const stKey = w.computedStatus || 'PRO_RATA'
                        const isLengkap = stKey === 'LENGKAP'
                        return (
                          <div key={w.id || w.nama} className="px-5 py-3.5 hover:bg-slate-800/30 transition-colors">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-extrabold text-white">{w.nama}</span>
                                {w.karyawan?.jabatan && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
                                    {w.karyawan.jabatan}
                                  </span>
                                )}
                              </div>
                              <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${
                                isLengkap ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              }`}>
                                {isLengkap ? 'Lengkap (6/6 Slot)' : `Tidak Lengkap (${w.verifiedCount}/6)`}
                              </span>
                            </div>

                            {/* Timeline Slot Buttons & Red Badges for Missed Slots */}
                            <div className="flex flex-wrap gap-2 mt-2">
                              {w.timelineItems.map((item, idx) => {
                                if (item.type === 'scan') {
                                  const scan = item.data
                                  const scanTime = formatScanTime(scan.waktu_scan, scan.client_tz || projectTz)
                                  const slotLabel = scan.absen_jadwal_slot?.label || item.slot?.label || ''
                                  const jenis = scan.absen_jadwal_slot?.jenis || ''
                                  const hasPhoto = !!scan.foto_url
                                  const hasGps = scan.gps_lat && scan.gps_lng

                                  return (
                                    <button
                                      key={scan.id || `s-${idx}`}
                                      onClick={() => setSelectedScan(scan)}
                                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700/80 hover:border-cyan-400 hover:bg-cyan-500/10 transition-all text-xs group shadow-sm"
                                    >
                                      <div className={`w-2 h-2 rounded-full shrink-0 ${slotColor[jenis] || 'bg-gray-400'}`} />
                                      <span className="font-bold text-slate-200">{scanTime}</span>
                                      {scan.lokasi_kerja && <span className="font-extrabold text-white">• {scan.lokasi_kerja}</span>}
                                      <span className="text-slate-400 font-medium">{slotLabel}</span>
                                      {hasPhoto && <ImageIcon size={11} className="text-cyan-400" />}
                                      {hasGps && <MapPin size={11} className="text-emerald-400" />}
                                      {scan.di_luar_lokasi && <MapPinOff size={11} className="text-amber-400" />}
                                    </button>
                                  )
                                } else if (item.type === 'lapor') {
                                  return (
                                    <div
                                      key={`l-${idx}`}
                                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/40 text-blue-300 text-xs font-bold"
                                    >
                                      <CheckCircle size={12} className="text-blue-400" />
                                      <span>Lapor Terlewat ({item.slot?.label || 'Approved'})</span>
                                    </div>
                                  )
                                } else {
                                  // TERLEWAT (MISSED SLOT) -> RED BADGE!
                                  return (
                                    <div
                                      key={`t-${idx}`}
                                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-400 text-xs font-bold shadow-sm"
                                      title={`Slot ${item.slot?.label || ''} terlewat (tidak ada scan)`}
                                    >
                                      <X size={12} className="text-red-400 stroke-[3]" />
                                      <span>Terlewat ({item.slot?.label || ''})</span>
                                    </div>
                                  )
                                }
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </Fragment>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <ScanFace size={36} className="mx-auto text-slate-600 mb-2" />
                  <p className="text-slate-400 text-sm font-medium">Tidak ada data presensi / scan wajah</p>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-16 text-center">
              <Calendar size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Pilih Tanggal</p>
              <p className="text-gray-400 text-sm mt-1">Klik tanggal dari kalender untuk melihat detail absensi</p>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Scan detail modal */}
      {selectedScan && (
        <div className="modal-overlay" onClick={() => setSelectedScan(null)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ScanFace size={18} className="text-cyan-500" />
                <span className="font-semibold text-gray-900">Detail Scan</span>
              </div>
              <button onClick={() => setSelectedScan(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={16} className="text-gray-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Photo - clickable to zoom */}
              {selectedScan.foto_url && (
                <div className="flex justify-center">
                  <button
                    onClick={() => setZoomPhoto(selectedScan.foto_url)}
                    className="relative group"
                  >
                    <img
                      src={selectedScan.foto_url}
                      alt="Foto scan wajah"
                      className="w-40 h-40 rounded-xl object-cover border-2 border-gray-200 group-hover:border-cyan-400 transition-colors"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-xl transition-colors flex items-center justify-center">
                      <ZoomIn size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                  </button>
                </div>
              )}

              {/* Details */}
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Nama</span>
                  <span className="text-gray-900 font-medium">{selectedScan.absen_karyawan?.nama}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Waktu Scan</span>
                  <span className="text-gray-900 font-medium flex items-center gap-1">
                    <Clock size={12} className="text-gray-400" />
                    {formatScanTimeFull(selectedScan.waktu_scan, selectedScan.client_tz || projectTz)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Slot</span>
                  <span className="text-gray-900">
                    {selectedScan.absen_jadwal_slot?.jam?.slice(0, 5)} — {selectedScan.absen_jadwal_slot?.label}
                  </span>
                </div>
                {selectedScan.confidence && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Confidence</span>
                    <span className={`font-medium ${confidenceLevel(selectedScan.confidence).cls}`}>
                      {(selectedScan.confidence * 100).toFixed(0)}% ({confidenceLevel(selectedScan.confidence).label})
                    </span>
                  </div>
                )}
                {selectedScan.lokasi_kerja && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Lokasi</span>
                    <span className="text-gray-900">{selectedScan.lokasi_kerja}</span>
                  </div>
                )}
                {selectedScan.jenis_pekerjaan && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Pekerjaan</span>
                    <span className="text-gray-900">{selectedScan.jenis_pekerjaan}</span>
                  </div>
                )}
                {selectedScan.keterangan && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Keterangan</span>
                    <span className="text-gray-900">{selectedScan.keterangan}</span>
                  </div>
                )}
              </div>

              {/* GPS & Off-Site Status Box */}
              {selectedScan.gps_lat && selectedScan.gps_lng && (() => {
                const sLat = Number(siteConfig?.lat || -4.824518)
                const sLng = Number(siteConfig?.lng || 136.844673)
                const sRadius = Number(siteConfig?.radius || 400)
                const scanDist = getDistanceMeters(selectedScan.gps_lat, selectedScan.gps_lng, sLat, sLng)
                const isOffsite = scanDist > sRadius || selectedScan?.di_luar_lokasi

                return (
                  <div className={`border rounded-xl p-3.5 space-y-2.5 ${isOffsite ? 'bg-rose-50 border-rose-300' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
                        <MapPin size={15} className={isOffsite ? "text-rose-600" : "text-emerald-500"} />
                        <span>Koordinat GPS</span>
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${selectedScan.gps_lat},${selectedScan.gps_lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold"
                      >
                        <ExternalLink size={12} />
                        Buka di Google Maps
                      </a>
                    </div>

                    <div className="text-xs text-gray-600 font-mono">
                      {Number(selectedScan.gps_lat).toFixed(7)}, {Number(selectedScan.gps_lng).toFixed(7)}
                    </div>

                    {isOffsite ? (
                      <div className="pt-2.5 border-t border-rose-200 flex items-center justify-between text-xs font-bold text-rose-700">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                          <span>Presensi Di Luar Site (Off-Site)</span>
                        </span>
                        <span className="font-mono text-[11px] bg-rose-100 border border-rose-300 px-2 py-0.5 rounded text-rose-800">
                          {formatDistance(scanDist)} dari site (Maks: {sRadius}m)
                        </span>
                      </div>
                    ) : (
                      <div className="pt-2.5 border-t border-gray-200 flex items-center justify-between text-xs font-medium text-emerald-700">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                          <span>Di Dalam Radius Site</span>
                        </span>
                        <span className="font-mono text-[11px] bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded text-emerald-800">
                          {formatDistance(scanDist)} dari site
                        </span>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Photo zoom overlay */}
      {zoomPhoto && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setZoomPhoto(null)}
        >
          <button
            onClick={() => setZoomPhoto(null)}
            className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
          >
            <X size={20} className="text-white" />
          </button>
          <img
            src={zoomPhoto}
            alt="Foto scan wajah"
            className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
