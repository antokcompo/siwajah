import { useEffect, useState, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Calendar, ScanFace, MapPin, MapPinOff, Clock, X, Image as ImageIcon, ExternalLink, ZoomIn, AlertTriangle, CheckCircle, Search, Table, LayoutList, Users, CheckCircle2, AlertCircle, XCircle, Sun, Moon, Zap, Briefcase, Shield, FileText, FileWarning } from 'lucide-react'
import { getDistanceMeters, formatDistance, isLocationOutsideGeofence } from '../lib/geoUtils'
import { getActiveProject } from './PilihProyek'

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

function getScanLocalTimeStr(waktu, tz) {
  if (!waktu) return ''
  try {
    const d = new Date(waktu)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz || 'Asia/Jayapura', hour12: false })
  } catch (e) {
    return ''
  }
}

function timeToMinutes(timeStr) {
  if (!timeStr) return 0
  const parts = timeStr.slice(0, 5).split(':')
  return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0)
}

function getOvernightSortKey(jamStr) {
  if (!jamStr) return 9999
  const [h, m] = jamStr.slice(0, 5).split(':').map(Number)
  const effectiveHour = h >= 12 ? h : h + 24
  return effectiveHour * 60 + (m || 0)
}

function getCategorySlots(category, slotMaster = [], dayScans = [], dayLapors = []) {
  const candidateSlotsMap = new Map()

  const addCandidate = (s) => {
    if (!s) return
    let jam = s.jam || s.slot_jam || ''
    if (jam.startsWith('17:15') || (s.jenis === 'pulang' && jam.startsWith('17:'))) {
      jam = '17:00:00'
    }
    const jamPrefix = jam.slice(0, 5)
    const lbl = s.label || s.slot_label || ''
    const jenis = (s.jenis || '').toLowerCase()
    const cat = s.kategori_shift || (
      lbl.toLowerCase().includes('malam') || ['00:00','01:00','02:00','03:00','04:00','22:00','23:00'].includes(jamPrefix)
        ? 'SECURITY_MALAM'
        : (lbl.toLowerCase().includes('security') ? 'SECURITY_PAGI' : 'REGULER')
    )

    let belongsToCategory = false
    if (category === 'pekerja') {
      belongsToCategory = cat === 'REGULER' && !['06:00','00:00','01:00','02:00','03:00','04:00','22:00','23:00'].includes(jamPrefix) && !lbl.toLowerCase().includes('security') && !lbl.toLowerCase().includes('lembur')
    } else if (category === 'security_pagi') {
      belongsToCategory = cat === 'SECURITY_PAGI' || (lbl.toLowerCase().includes('security') && !lbl.toLowerCase().includes('malam') && !['22:00','23:00','00:00','01:00','02:00','03:00','04:00'].includes(jamPrefix))
    } else if (category === 'security_malam') {
      belongsToCategory = cat === 'SECURITY_MALAM' || lbl.toLowerCase().includes('malam') || ['17:00','19:00','22:00','23:00','00:00','01:00','02:00','03:00','04:00','06:00'].includes(jamPrefix)
    } else if (category === 'lembur') {
      belongsToCategory = jenis === 'lembur' || jenis === 'pulang_lembur' || lbl.toLowerCase().includes('lembur')
    }

    if (belongsToCategory) {
      const isPulangLembur = jenis === 'pulang_lembur' || lbl.toLowerCase().includes('pulang lembur')
      const isMasukLembur = jenis === 'lembur' || lbl.toLowerCase().includes('masuk lembur')
      const key = isPulangLembur ? 'pulang_lembur' : jamPrefix

      if (key && !candidateSlotsMap.has(key)) {
        candidateSlotsMap.set(key, {
          id: s.id || `${category}_${key}`,
          normalizedJam: isPulangLembur ? '23:59' : jamPrefix,
          displayJam: isPulangLembur ? 'Pulang' : jamPrefix,
          label: lbl || (isPulangLembur ? 'Pulang Lembur' : (isMasukLembur ? 'Masuk Lembur' : jamPrefix)),
          jenis: isPulangLembur ? 'pulang_lembur' : (isMasukLembur ? 'lembur' : (s.jenis || 'normal')),
          urutan: s.urutan || 0,
          jam: jam
        })
      }
    }
  }

  // 1. Add all active slot master definitions
  (slotMaster || []).forEach(addCandidate)

  // 2. Also add any historical slots that were scanned or reported on that day for this category
  ;(dayScans || []).forEach(s => {
    if (s.absen_jadwal_slot) addCandidate(s.absen_jadwal_slot)
    else if (s.slot_jam) addCandidate({ id: s.slot_id, jam: s.slot_jam, label: s.slot_label, jenis: s.slot_jenis })
  })
  ;(dayLapors || []).forEach(l => {
    if (l.absen_jadwal_slot) addCandidate(l.absen_jadwal_slot)
  })

  let slots = Array.from(candidateSlotsMap.values())

  // Fallbacks if database has no slots for category yet
  if (slots.length === 0) {
    if (category === 'pekerja') {
      slots = [
        { id: 'p_08:00', normalizedJam: '08:00', displayJam: '08:00', label: 'Masuk Pagi', jenis: 'masuk', urutan: 1, jam: '08:00:00' },
        { id: 'p_10:00', normalizedJam: '10:00', displayJam: '10:00', label: 'Progres 1', jenis: 'progress', urutan: 2, jam: '10:00:00' },
        { id: 'p_11:30', normalizedJam: '11:30', displayJam: '11:30', label: 'Istirahat', jenis: 'istirahat', urutan: 3, jam: '11:30:00' },
        { id: 'p_13:00', normalizedJam: '13:00', displayJam: '13:00', label: 'Masuk Siang', jenis: 'masuk', urutan: 4, jam: '13:00:00' },
        { id: 'p_15:00', normalizedJam: '15:00', displayJam: '15:00', label: 'Progres 2', jenis: 'progress', urutan: 5, jam: '15:00:00' },
        { id: 'p_17:00', normalizedJam: '17:00', displayJam: '17:00', label: 'Pulang', jenis: 'pulang', urutan: 6, jam: '17:00:00' },
      ]
    } else if (category === 'security_pagi') {
      slots = [
        { id: 'sp_06:00', normalizedJam: '06:00', displayJam: '06:00', label: 'Masuk Pagi', jenis: 'masuk', urutan: 1, jam: '06:00:00' },
        { id: 'sp_08:00', normalizedJam: '08:00', displayJam: '08:00', label: 'Patroli 1', jenis: 'progress', urutan: 2, jam: '08:00:00' },
        { id: 'sp_10:00', normalizedJam: '10:00', displayJam: '10:00', label: 'Patroli 2', jenis: 'progress', urutan: 3, jam: '10:00:00' },
        { id: 'sp_11:30', normalizedJam: '11:30', displayJam: '11:30', label: 'Istirahat', jenis: 'istirahat', urutan: 4, jam: '11:30:00' },
        { id: 'sp_13:00', normalizedJam: '13:00', displayJam: '13:00', label: 'Patroli 3', jenis: 'progress', urutan: 5, jam: '13:00:00' },
        { id: 'sp_15:00', normalizedJam: '15:00', displayJam: '15:00', label: 'Patroli 4', jenis: 'progress', urutan: 6, jam: '15:00:00' },
        { id: 'sp_17:00', normalizedJam: '17:00', displayJam: '17:00', label: 'Serah Terima', jenis: 'pulang', urutan: 7, jam: '17:00:00' },
      ]
    } else if (category === 'security_malam') {
      slots = [
        { id: 'sm_17:00', normalizedJam: '17:00', displayJam: '17:00', label: 'Masuk Malam', jenis: 'masuk', urutan: 1, jam: '17:00:00' },
        { id: 'sm_19:00', normalizedJam: '19:00', displayJam: '19:00', label: 'Patroli 1', jenis: 'progress', urutan: 2, jam: '19:00:00' },
        { id: 'sm_22:00', normalizedJam: '22:00', displayJam: '22:00', label: 'Patroli 2', jenis: 'progress', urutan: 3, jam: '22:00:00' },
        { id: 'sm_00:00', normalizedJam: '00:00', displayJam: '00:00', label: 'Patroli Tengah', jenis: 'progress', urutan: 4, jam: '00:00:00' },
        { id: 'sm_02:00', normalizedJam: '02:00', displayJam: '02:00', label: 'Patroli Dini Hari', jenis: 'progress', urutan: 5, jam: '02:00:00' },
        { id: 'sm_04:00', normalizedJam: '04:00', displayJam: '04:00', label: 'Patroli Subuh', jenis: 'progress', urutan: 6, jam: '04:00:00' },
        { id: 'sm_06:00', normalizedJam: '06:00', displayJam: '06:00', label: 'Serah Terima', jenis: 'pulang', urutan: 7, jam: '06:00:00' },
      ]
    } else if (category === 'lembur') {
      slots = [
        { id: 'l_19:00', normalizedJam: '19:00', displayJam: '19:00', label: 'Masuk Lembur', jenis: 'lembur', urutan: 1, jam: '19:00:00' },
        { id: 'l_pulang', normalizedJam: '23:59', displayJam: 'Pulang', label: 'Pulang Lembur', jenis: 'pulang_lembur', urutan: 2, jam: '23:59:00' },
      ]
    }
  }

  // Sort slots appropriately
  if (category === 'security_malam') {
    slots.sort((a, b) => {
      const uA = Number(a.urutan)
      const uB = Number(b.urutan)
      if (!isNaN(uA) && !isNaN(uB) && uA !== uB && uA > 0 && uB > 0) return uA - uB
      return getOvernightSortKey(a.jam || a.normalizedJam) - getOvernightSortKey(b.jam || b.normalizedJam)
    })
  } else if (category === 'lembur') {
    slots.sort((a, b) => {
      if (a.jenis === 'pulang_lembur') return 1
      if (b.jenis === 'pulang_lembur') return -1
      return (a.normalizedJam || '').localeCompare(b.normalizedJam || '')
    })
  } else {
    slots.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || (a.normalizedJam || '').localeCompare(b.normalizedJam || ''))
  }

  return slots
}

export default function RekapHarian() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [data, setData] = useState([])
  const [detail, setDetail] = useState([])
  const [scanData, setScanData] = useState([])
  const [mandorMap, setMandorMap] = useState({})
  const [empMap, setEmpMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('semua')
  const [categoryTab, setCategoryTab] = useState('semua') // 'semua' | 'pekerja' | 'security_pagi' | 'security_malam' | 'lembur'
  const [searchQuery, setSearchQuery] = useState('')
  const [slotMaster, setSlotMaster] = useState([])
  const [laporanData, setLaporanData] = useState([])
  const [selectedScan, setSelectedScan] = useState(null)
  const [zoomPhoto, setZoomPhoto] = useState(null)
  const [projectTz, setProjectTz] = useState('Asia/Jayapura')
  const [siteConfig, setSiteConfig] = useState({ lat: -4.824518, lng: 136.844673, radius: 400 })
  const [viewMode, setViewMode] = useState('tabel') // 'tabel' | 'kartu'
  const [lemburMap, setLemburMap] = useState({})
  const [securityRosterMap, setSecurityRosterMap] = useState({})

  const bulan = currentDate.getMonth() + 1
  const tahun = currentDate.getFullYear()

  useEffect(() => {
    loadTimezone()
    loadSlots()
  }, [])

  useEffect(() => {
    loadMonth()
    const handleStorage = () => loadMonth()
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [bulan, tahun])

  useEffect(() => {
    if (selectedDate) {
      loadDetail(selectedDate)
      loadScanWajah(selectedDate)
    }
  }, [selectedDate, filter])

  async function loadSlots() {
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'
    const { data } = await supabase
      .from('absen_jadwal_slot')
      .select('*')
      .eq('aktif', true)
      .eq('kode_proyek', activeKode)
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
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    const { data: karyawanProyek } = await supabase.from('absen_karyawan').select('id, nama, jabatan, atasan_id').eq('kode_proyek', activeKode)
    const kIds = (karyawanProyek || []).map(k => k.id)
    const kMap = {}
    ;(karyawanProyek || []).forEach(k => { kMap[k.id] = k })
    setEmpMap(kMap)

    if (kIds.length === 0) {
      setData([])
      setMandorMap({})
      setLoading(false)
      return
    }

    const start = format(startOfMonth(currentDate), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentDate), 'yyyy-MM-dd')
    const [harianRes, scanRes, laporanRes, mandorRes] = await Promise.all([
      supabase
        .from('absen_harian')
        .select('karyawan_id, tanggal, status, jam_masuk, jam_pulang, is_insiden')
        .in('karyawan_id', kIds)
        .gte('tanggal', start)
        .lte('tanggal', end),
      supabase
        .from('absen_scan_wajah')
        .select('karyawan_id, tanggal, slot_id, absen_jadwal_slot(jenis)')
        .in('karyawan_id', kIds)
        .gte('tanggal', start)
        .lte('tanggal', end),
      supabase
        .from('absen_laporan_terlewat')
        .select('karyawan_id, tanggal, slot_id, absen_jadwal_slot(jenis)')
        .in('karyawan_id', kIds)
        .eq('status', 'APPROVED')
        .gte('tanggal', start)
        .lte('tanggal', end),
      supabase.from('absen_karyawan').select('id, nama').eq('kode_proyek', activeKode).ilike('jabatan', '%mandor%').eq('status_aktif', true),
    ])

    const monthSlotCounts = {}
    ;(scanRes.data || []).forEach(s => {
      const j = (s.absen_jadwal_slot?.jenis || '').toLowerCase()
      if (!j.includes('lembur')) {
        const key = `${s.karyawan_id}_${s.tanggal}`
        if (!monthSlotCounts[key]) monthSlotCounts[key] = new Set()
        monthSlotCounts[key].add(s.slot_id)
      }
    })
    ;(laporanRes.data || []).forEach(l => {
      const j = (l.absen_jadwal_slot?.jenis || '').toLowerCase()
      if (!j.includes('lembur')) {
        const key = `${l.karyawan_id}_${l.tanggal}`
        if (!monthSlotCounts[key]) monthSlotCounts[key] = new Set()
        monthSlotCounts[key].add(l.slot_id)
      }
    })

    const enrichedHarianMonth = (harianRes.data || []).map(h => {
      const key = `${h.karyawan_id}_${h.tanggal}`
      const vSlots = monthSlotCounts[key] ? monthSlotCounts[key].size : 0
      let computedStatus = h.status
      if (vSlots < 6) {
        computedStatus = 'TIDAK_LENGKAP'
      } else {
        computedStatus = 'LENGKAP'
      }
      return {
        ...h,
        verifiedSlots: vSlots,
        computedStatus
      }
    })

    setData(enrichedHarianMonth)
    const mMap = {}
    ;(mandorRes.data || []).forEach(m => { mMap[m.id] = m.nama })
    setMandorMap(mMap)
    setLoading(false)
  }

  async function loadDetail(date) {
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    const { data: karyawanProyek } = await supabase.from('absen_karyawan').select('id, nama, jabatan, atasan_id').eq('kode_proyek', activeKode)
    const kIds = (karyawanProyek || []).map(k => k.id)
    const kMap = {}
    ;(karyawanProyek || []).forEach(k => { kMap[k.id] = k })
    setEmpMap(kMap)

    if (kIds.length === 0) {
      setDetail([])
      setLaporanData([])
      return
    }

    const [rpcRes, scanRes, laporanRes, lemburRes, rosterRes, slotsRes] = await Promise.all([
      supabase.from('absen_harian').select('*, absen_karyawan(id, nama, jabatan, atasan_id)').in('karyawan_id', kIds).eq('tanggal', date),
      supabase
        .from('absen_scan_wajah')
        .select('*, absen_karyawan(id, nama, jabatan, atasan_id), absen_jadwal_slot(id, label, jam, jenis, kategori_shift)')
        .in('karyawan_id', kIds)
        .eq('tanggal', date),
      supabase
        .from('absen_laporan_terlewat')
        .select('*, absen_karyawan(id, nama, jabatan, atasan_id), absen_jadwal_slot(id, label, jam, jenis, kategori_shift)')
        .in('karyawan_id', kIds)
        .eq('tanggal', date)
        .eq('status', 'APPROVED'),
      supabase.from('absen_daftar_lembur').select('karyawan_id').eq('tanggal', date).eq('status', 'APPROVED').in('karyawan_id', kIds),
      supabase.from('absen_roster_security').select('karyawan_id, shift').eq('tanggal', date).in('karyawan_id', kIds),
      supabase.from('absen_jadwal_slot').select('*').eq('aktif', true).eq('kode_proyek', activeKode).order('urutan', { ascending: true })
    ])

    if (slotsRes.data) setSlotMaster(slotsRes.data)

    const lMap = {}
    ;(lemburRes.data || []).forEach(l => { lMap[l.karyawan_id] = true })
    setLemburMap(lMap)

    const rMap = {}
    ;(rosterRes.data || []).forEach(r => { rMap[r.karyawan_id] = r.shift })
    setSecurityRosterMap(rMap)

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
        .select('*, absen_karyawan(id, nama, jabatan, atasan_id)')
        .eq('tanggal', date)
      if (filter !== 'semua') q = q.eq('status', filter)
      const { data: fallback } = await q
      rawList = fallback || []
    } else {
      rawList = (rpcRes.data || []).map(d => {
        const empInfo = (d.absen_karyawan && d.absen_karyawan.nama)
          ? d.absen_karyawan
          : (kMap[d.karyawan_id] || { id: d.karyawan_id, nama: d.karyawan_nama || 'Unknown', jabatan: d.karyawan_jabatan || '-', atasan_id: d.atasan_id })
        return {
          ...d,
          absen_karyawan: empInfo
        }
      })
    }

    const enriched = rawList.map(item => {
      const kid = item.karyawan_id || item.absen_karyawan?.id
      const vSlots = slotCounts[kid] ? slotCounts[kid].size : 0
      let computedStatus = item.status
      if (vSlots < 6) {
        computedStatus = 'TIDAK_LENGKAP'
      } else {
        computedStatus = 'LENGKAP'
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
    if (dayData.every(d => (d.computedStatus || d.status) === 'LENGKAP')) return 'ok'
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

  const categorizedScans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    const workerMap = {}

    detail.forEach(d => {
      const k = (d.absen_karyawan && d.absen_karyawan.nama) ? d.absen_karyawan : (empMap[d.karyawan_id] || d.absen_karyawan)
      if (!k) return
      const kid = d.karyawan_id || k.id
      const atasanId = k.atasan_id
      const groupName = atasanId && mandorMap[atasanId] ? mandorMap[atasanId] : 'Harian Kantor'
      if (!workerMap[kid]) {
        workerMap[kid] = { karyawan: k, groupName, scans: [], lapors: [], computedStatus: d.computedStatus || d.status, verifiedSlots: d.verifiedSlots || 0 }
      }
    })

    scanData.forEach(s => {
      const k = (s.absen_karyawan && s.absen_karyawan.nama) ? s.absen_karyawan : (empMap[s.karyawan_id] || s.absen_karyawan)
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
      const k = (l.absen_karyawan && l.absen_karyawan.nama) ? l.absen_karyawan : (empMap[l.karyawan_id] || l.absen_karyawan)
      if (!k) return
      const kid = l.karyawan_id || k.id
      const atasanId = k.atasan_id
      const groupName = atasanId && mandorMap[atasanId] ? mandorMap[atasanId] : 'Harian Kantor'
      if (!workerMap[kid]) {
        workerMap[kid] = { karyawan: k, groupName, scans: [], lapors: [], computedStatus: 'PRO_RATA', verifiedSlots: 0 }
      }
      workerMap[kid].lapors.push(l)
    })

    const categories = {
      pekerja: {},
      security_pagi: {},
      security_malam: {},
      lembur: {},
    }

    const counts = {
      total: 0,
      pekerja: 0,
      security_pagi: 0,
      security_malam: 0,
      lembur: 0,
    }

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

      // Determine shift category
      const isSecurity = jabatanLow.includes('security') || jabatanLow.includes('satpam') || jabatanLow.includes('sec')
      const isLemburApproved = !!lemburMap[w.karyawan.id]
      const secShift = (securityRosterMap[w.karyawan.id] || 'PAGI').toUpperCase()

      let catKey = 'pekerja'
      if (isLemburApproved) {
        catKey = 'lembur'
      } else if (isSecurity) {
        catKey = secShift === 'MALAM' ? 'security_malam' : 'security_pagi'
      }

      counts[catKey] = (counts[catKey] || 0) + 1
      counts.total++

      const categorySlots = getCategorySlots(catKey, slotMaster, scanData, laporanData)

      // Build status map and timeline items strictly for this category's slots
      const slotStatusMap = {}
      const timelineItems = []
      let verifiedCount = 0

      categorySlots.forEach(slot => {
        const slotJamPrefix = slot.normalizedJam
        const slotMins = timeToMinutes(slotJamPrefix)

        // 1. Direct ID match
        let matchingScan = w.scans.find(s => s.slot_id && String(s.slot_id) === String(slot.id))

        // 2. Relation ID match
        if (!matchingScan) {
          matchingScan = w.scans.find(s => s.absen_jadwal_slot?.id && String(s.absen_jadwal_slot.id) === String(slot.id))
        }

        // 3. Slot Type match
        if (!matchingScan) {
          matchingScan = w.scans.find(s => {
            const sjType = (s.absen_jadwal_slot?.jenis || '').toLowerCase()
            const sjLbl = (s.absen_jadwal_slot?.label || '').toLowerCase()
            let sj = s.absen_jadwal_slot?.jam || s.slot_jam

            if (slot.jenis === 'pulang_lembur') {
              return sjType === 'pulang_lembur' || sjLbl.includes('pulang lembur')
            }
            if (slot.jenis === 'lembur') {
              return sjType === 'lembur' || sjLbl.includes('masuk lembur') || sj === '19:00:00' || sj === '19:00'
            }

            if (sj && (sj.startsWith('17:15') || sj.startsWith('17:'))) sj = '17:00'
            return sj && sj.slice(0, 5) === slotJamPrefix
          })
        }

        // 4. Local Time Proximity Match
        if (!matchingScan) {
          if (slot.jenis === 'pulang_lembur') {
            matchingScan = w.scans.find(s => {
              const scanLocalTime = getScanLocalTimeStr(s.waktu_scan, s.client_tz || projectTz)
              if (!scanLocalTime) return false
              const m = timeToMinutes(scanLocalTime)
              const sjType = (s.absen_jadwal_slot?.jenis || '').toLowerCase()
              return sjType === 'pulang_lembur' || m >= 20 * 60 || m <= 5 * 60
            })
          } else if (slot.jenis === 'lembur') {
            matchingScan = w.scans.find(s => {
              const scanLocalTime = getScanLocalTimeStr(s.waktu_scan, s.client_tz || projectTz)
              if (!scanLocalTime) return false
              const m = timeToMinutes(scanLocalTime)
              return m >= 18 * 60 && m <= 19 * 60 + 59
            })
          } else {
            let closestScan = null
            let minDiff = Infinity
            w.scans.forEach(s => {
              const scanLocalTime = getScanLocalTimeStr(s.waktu_scan, s.client_tz || projectTz)
              if (scanLocalTime) {
                const scanMins = timeToMinutes(scanLocalTime)
                const diff = Math.abs(scanMins - slotMins)
                if (diff <= 90 && diff < minDiff) {
                  minDiff = diff
                  closestScan = s
                }
              }
            })
            matchingScan = closestScan
          }
        }

        // Matching Lapor
        let matchingLapor = w.lapors.find(l => l.slot_id && String(l.slot_id) === String(slot.id))
        if (!matchingLapor) {
          matchingLapor = w.lapors.find(l => {
            const ljType = (l.absen_jadwal_slot?.jenis || '').toLowerCase()
            if (slot.jenis === 'pulang_lembur') return ljType === 'pulang_lembur'
            if (slot.jenis === 'lembur') return ljType === 'lembur'
            let lj = l.absen_jadwal_slot?.jam
            if (lj && (lj.startsWith('17:15') || lj.startsWith('17:'))) lj = '17:00'
            return lj && lj.slice(0, 5) === slotJamPrefix
          })
        }

        if (matchingScan) {
          slotStatusMap[slotJamPrefix] = { type: 'scan', data: matchingScan, slot }
          timelineItems.push({ type: 'scan', data: matchingScan, slot })
          verifiedCount++
        } else if (matchingLapor) {
          slotStatusMap[slotJamPrefix] = { type: 'lapor', data: matchingLapor, slot }
          timelineItems.push({ type: 'lapor', data: matchingLapor, slot })
          verifiedCount++
        } else {
          slotStatusMap[slotJamPrefix] = { type: 'terlewat', slot }
          timelineItems.push({ type: 'terlewat', slot })
        }
      })

      const expectedCount = categorySlots.length
      const isLengkap = expectedCount > 0 && verifiedCount >= expectedCount
      const computedStatus = isLengkap ? 'LENGKAP' : 'TIDAK_LENGKAP'

      if (filter !== 'semua') {
        if (filter === 'LENGKAP' && !isLengkap) return
        if (filter === 'TIDAK_LENGKAP' && isLengkap) return
      }

      if (!categories[catKey][groupName]) categories[catKey][groupName] = []

      categories[catKey][groupName].push({
        id: w.karyawan.id,
        nama,
        karyawan: w.karyawan,
        shiftCategory: catKey,
        slotStatusMap,
        categorySlots,
        timelineItems,
        computedStatus,
        verifiedCount,
        expectedCount,
      })
    })

    const formatGroups = (groupObj) => {
      return Object.entries(groupObj)
        .sort(([a], [b]) => {
          if (a === 'Harian Kantor') return 1
          if (b === 'Harian Kantor') return -1
          return a.localeCompare(b)
        })
        .map(([groupName, workers]) => ({
          groupName,
          workers: workers.sort((a, b) => a.nama.localeCompare(b.nama)),
        }))
    }

    return {
      pekerja: formatGroups(categories.pekerja),
      security_pagi: formatGroups(categories.security_pagi),
      security_malam: formatGroups(categories.security_malam),
      lembur: formatGroups(categories.lembur),
      counts,
    }
  }, [detail, scanData, laporanData, slotMaster, mandorMap, searchQuery, filter, lemburMap, securityRosterMap, projectTz])

  const stats = useMemo(() => {
    let totalWorkers = 0
    let lengkap = 0
    let tidakLengkap = 0
    let totalTerlewat = 0

    const allGroups = [
      ...categorizedScans.pekerja,
      ...categorizedScans.security_pagi,
      ...categorizedScans.security_malam,
      ...categorizedScans.lembur,
    ]

    allGroups.forEach(g => {
      g.workers.forEach(w => {
        totalWorkers++
        if (w.computedStatus === 'LENGKAP') lengkap++
        else tidakLengkap++
        totalTerlewat += Math.max(0, (w.expectedCount || 0) - (w.verifiedCount || 0))
      })
    })

    return { totalWorkers, lengkap, tidakLengkap, totalTerlewat }
  }, [categorizedScans])

  const categoriesToRender = useMemo(() => {
    const pekerjaSlots = getCategorySlots('pekerja', slotMaster, scanData, laporanData)
    const pFirst = pekerjaSlots[0]?.normalizedJam || '08:00'
    const pLast = pekerjaSlots[pekerjaSlots.length - 1]?.normalizedJam || '17:00'

    const secPagiSlots = getCategorySlots('security_pagi', slotMaster, scanData, laporanData)
    const spFirst = secPagiSlots[0]?.normalizedJam || '06:00'
    const spLast = secPagiSlots[secPagiSlots.length - 1]?.normalizedJam || '17:00'

    const secMalamSlots = getCategorySlots('security_malam', slotMaster, scanData, laporanData)
    const smFirst = secMalamSlots[0]?.normalizedJam || '17:00'
    const smLast = secMalamSlots[secMalamSlots.length - 1]?.normalizedJam || '06:00'

    const lemburSlots = getCategorySlots('lembur', slotMaster, scanData, laporanData)

    const catDefs = [
      {
        key: 'pekerja',
        title: 'Pekerja Reguler',
        subTitle: `${pekerjaSlots.length} Slot Jam Normal (${pFirst} - ${pLast})`,
        icon: Briefcase,
        badgeBg: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
        slots: pekerjaSlots,
        groups: categorizedScans.pekerja,
        count: categorizedScans.counts.pekerja,
      },
      {
        key: 'security_pagi',
        title: 'Security Shift Pagi',
        subTitle: `${secPagiSlots.length} Slot Shift Pagi (${spFirst} - ${spLast})`,
        icon: Sun,
        badgeBg: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40',
        slots: secPagiSlots,
        groups: categorizedScans.security_pagi,
        count: categorizedScans.counts.security_pagi,
      },
      {
        key: 'security_malam',
        title: 'Security Shift Malam',
        subTitle: `${secMalamSlots.length} Slot Shift Malam (${smFirst} - ${smLast})`,
        icon: Moon,
        badgeBg: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40',
        slots: secMalamSlots,
        groups: categorizedScans.security_malam,
        count: categorizedScans.counts.security_malam,
      },
      {
        key: 'lembur',
        title: 'Pekerja Lembur',
        subTitle: `${lemburSlots.length} Slot Lembur Khusus (19:00 Masuk & Pulang Lembur)`,
        icon: Zap,
        badgeBg: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
        slots: lemburSlots,
        groups: categorizedScans.lembur,
        count: categorizedScans.counts.lembur,
      },
    ]

    const list = []
    catDefs.forEach(cat => {
      if (categoryTab === 'semua') {
        if (cat.groups.length > 0) list.push(cat)
      } else if (categoryTab === cat.key) {
        list.push(cat)
      }
    })

    return list
  }, [categoryTab, categorizedScans, slotMaster, scanData, laporanData])

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
          <div className="flex flex-col gap-1.5 mt-5 pt-4 border-t border-gray-800 text-[11px] text-gray-400">
            <div className="font-bold text-gray-300 text-xs mb-0.5">Keterangan Indikator Tanggal:</div>
            <div className="flex items-center gap-2" title="Seluruh presensi pekerja pada tanggal ini LENGKAP (6/6 Slot)">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span><strong className="text-emerald-400">OK (Lengkap)</strong>: Seluruh pekerja presensi 100% lengkap</span>
            </div>
            <div className="flex items-center gap-2" title="Ada pekerja dengan presensi belum lengkap (< 6 Slot) atau butuh koreksi">
              <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span><strong className="text-amber-400">Koreksi / Perlu Atensi</strong>: Ada pekerja presensi belum lengkap</span>
            </div>
            <div className="flex items-center gap-2" title="Terdapat laporan insiden darurat / operasional proyek">
              <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <span><strong className="text-red-400">Insiden</strong>: Ada catatan insiden darurat / insiden proyek</span>
            </div>
          </div>
        </div>

        {/* Detail */}
        <div className="lg:col-span-2 space-y-4">
          {selectedDate ? (
            <div className="card overflow-hidden border border-slate-800 bg-slate-900/90 shadow-xl">
              {/* Summary Stats Bar */}
              <div className="p-4 bg-slate-950/90 border-b border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <Users size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Pekerja</div>
                    <div className="text-lg font-black text-white font-mono">{stats.totalWorkers}</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/20 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-emerald-400/80 tracking-wider">Lengkap (6/6)</div>
                    <div className="text-lg font-black text-emerald-400 font-mono">{stats.lengkap}</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-amber-500/20 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                    <AlertCircle size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-amber-400/80 tracking-wider">Belum Lengkap</div>
                    <div className="text-lg font-black text-amber-400 font-mono">{stats.tidakLengkap}</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-rose-500/30 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400">
                    <XCircle size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-rose-400/80 tracking-wider">Slot Terlewat</div>
                    <div className="text-lg font-black text-rose-400 font-mono">{stats.totalTerlewat}</div>
                  </div>
                </div>
              </div>

              {/* Single Unified Header */}
              <div className="px-5 py-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/90">
                <div className="flex items-center gap-2 font-bold text-white text-base shrink-0">
                  <ScanFace size={20} className="text-cyan-400 animate-pulse" />
                  <span>{format(new Date(selectedDate + 'T00:00'), 'EEEE, d MMMM yyyy', { locale: localeId })}</span>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 flex-1 max-w-xl justify-end">
                  {/* View Mode Toggle */}
                  <div className="flex items-center p-0.5 rounded-xl bg-slate-950 border border-slate-800 shrink-0">
                    <button
                      onClick={() => setViewMode('tabel')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        viewMode === 'tabel'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Table size={13} /> Tabel Per Jam
                    </button>
                    <button
                      onClick={() => setViewMode('kartu')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        viewMode === 'kartu'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <LayoutList size={13} /> Kartu Timeline
                    </button>
                  </div>

                  <div className="relative flex-1 min-w-[140px]">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Cari pekerja..."
                      className="w-full pl-8 pr-7 text-xs py-1.5 font-medium rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-white">
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  <select
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    className="text-xs py-1.5 px-2.5 rounded-xl font-semibold bg-slate-950 border border-slate-800 text-slate-200 focus:border-cyan-400 focus:outline-none shrink-0"
                  >
                    <option value="semua">Semua Status</option>
                    <option value="LENGKAP">Lengkap Saja</option>
                    <option value="TIDAK_LENGKAP">Ada Terlewat</option>
                  </select>
                </div>
              </div>

              {/* Category Filter Tabs Bar */}
              <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto">
                <button
                  onClick={() => setCategoryTab('semua')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    categoryTab === 'semua'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Users size={13} />
                  <span>Semua Shift</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
                    {categorizedScans.counts.total}
                  </span>
                </button>

                <button
                  onClick={() => setCategoryTab('pekerja')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    categoryTab === 'pekerja'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Briefcase size={13} />
                  <span>Pekerja Reguler</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
                    {categorizedScans.counts.pekerja}
                  </span>
                </button>

                <button
                  onClick={() => setCategoryTab('security_pagi')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    categoryTab === 'security_pagi'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Sun size={13} />
                  <span>Security Shift Pagi</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
                    {categorizedScans.counts.security_pagi}
                  </span>
                </button>

                <button
                  onClick={() => setCategoryTab('security_malam')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    categoryTab === 'security_malam'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Moon size={13} />
                  <span>Security Shift Malam</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
                    {categorizedScans.counts.security_malam}
                  </span>
                </button>

                <button
                  onClick={() => setCategoryTab('lembur')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    categoryTab === 'lembur'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Zap size={13} />
                  <span>Pekerja Lembur</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300 font-mono">
                    {categorizedScans.counts.lembur}
                  </span>
                </button>
              </div>

              {/* Categorized Content */}
              <div className="p-4 space-y-6">
                {categoriesToRender.length > 0 ? (
                  categoriesToRender.map(category => {
                    const CatIcon = category.icon
                    return (
                      <div key={category.key} className="space-y-3 bg-slate-950/60 rounded-2xl border border-slate-800/90 p-4 shadow-lg">
                        {/* Category Header */}
                        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
                          <div className="flex items-center gap-2.5">
                            <div className={`p-2 rounded-xl ${category.badgeBg}`}>
                              <CatIcon size={16} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-white">{category.title}</h3>
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${category.badgeBg}`}>
                                  {category.count} Orang
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400">{category.subTitle}</p>
                            </div>
                          </div>
                          <div className="text-[11px] text-cyan-400/80 font-mono font-bold bg-cyan-950/40 border border-cyan-500/20 px-2.5 py-1 rounded-lg">
                            {category.slots.length} Kolom Jam
                          </div>
                        </div>

                        {category.groups.length === 0 ? (
                          <div className="py-6 text-center text-xs text-slate-500">
                            Tidak ada data untuk {category.title} pada tanggal ini.
                          </div>
                        ) : viewMode === 'tabel' ? (
                          /* ================= TABEL KOLOM JAM PER KATEGORI ================= */
                          <div className="overflow-x-auto rounded-xl border border-slate-800">
                            <table className="w-full text-left border-collapse text-xs">
                              <thead>
                                <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                                  <th className="py-3 px-3 w-10 text-center">No</th>
                                  <th className="py-3 px-3 min-w-[150px]">Nama Pekerja</th>
                                  <th className="py-3 px-3 min-w-[100px]">Regu / Mandor</th>
                                  {category.slots.map(slot => (
                                    <th key={slot.id} className="py-3 px-2 text-center min-w-[95px]">
                                      <div className="text-slate-200 font-bold">{slot.normalizedJam}</div>
                                      <div className="text-[9px] text-slate-500 lowercase font-normal">{slot.label}</div>
                                    </th>
                                  ))}
                                  <th className="py-3 px-3 text-center min-w-[70px]">Total</th>
                                  <th className="py-3 px-3 text-center min-w-[110px]">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60">
                                {category.groups.map(({ groupName, workers }) => (
                                  <Fragment key={groupName}>
                                    <tr className="bg-slate-950/90 font-bold border-t border-b border-slate-800">
                                      <td colSpan={category.slots.length + 5} className="py-2 px-3 text-[11px] text-cyan-400">
                                        <div className="flex items-center justify-between">
                                          <span>MANDOR / REGU: {groupName}</span>
                                          <span className="text-slate-500 font-mono text-[10px]">{workers.length} Pekerja</span>
                                        </div>
                                      </td>
                                    </tr>
                                    {workers.map((w, idx) => {
                                      const isLengkap = w.computedStatus === 'LENGKAP'
                                      return (
                                        <tr key={w.id || w.nama} className="hover:bg-slate-800/40 transition-colors">
                                          <td className="py-2.5 px-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                                          <td className="py-2.5 px-3">
                                            <div className="font-bold text-white text-xs">{w.nama}</div>
                                            {w.karyawan?.jabatan && (
                                              <div className="text-[10px] text-cyan-300/80 mt-0.5">{w.karyawan.jabatan}</div>
                                            )}
                                          </td>
                                          <td className="py-2.5 px-3 text-slate-400 text-xs">{groupName}</td>
                                          {category.slots.map(slot => {
                                            const jamKey = slot.normalizedJam
                                            const item = w.slotStatusMap ? w.slotStatusMap[jamKey] : null

                                            if (!item) {
                                              return (
                                                <td key={slot.id || jamKey} className="py-2 px-1 text-center">
                                                  <span className="text-slate-600 font-mono text-xs select-none">-</span>
                                                </td>
                                              )
                                            }

                                            const isLapor = item.type === 'lapor' ||
                                              item.data?.metode === 'laporan' ||
                                              (item.data?.lokasi_kerja || '').toLowerCase().includes('lapor') ||
                                              Boolean(item.data?.is_laporan_terlewat) ||
                                              Boolean(item.data?.laporan_id)

                                            if (item.type === 'scan' || item.type === 'lapor') {
                                              const scan = item.data || {}
                                              const scanTime = scan.waktu_scan
                                                ? formatScanTime(scan.waktu_scan, scan.client_tz || projectTz)
                                                : (slot.normalizedJam || '')
                                              const hasPhoto = Boolean(scan.foto_url)

                                              if (isLapor) {
                                                // BLUE (Lapor Terlewat Disetujui)
                                                return (
                                                  <td key={slot.id || jamKey} className="py-2 px-1 text-center">
                                                    <button
                                                      onClick={() => scan.id ? setSelectedScan(scan) : null}
                                                      className="w-full p-1.5 rounded-lg bg-blue-950/70 border border-blue-500/60 hover:border-cyan-400 hover:bg-blue-900/60 transition flex flex-col items-center justify-center gap-0.5 group shadow-sm"
                                                      title="Lapor Terlewat Disetujui (Klik untuk detail)"
                                                    >
                                                      <span className="font-extrabold text-blue-300 text-[11px] group-hover:text-cyan-300">
                                                        {scanTime ? scanTime.slice(0, 5) : 'Lapor'}
                                                      </span>
                                                      <div className="flex items-center gap-1 text-[9px] text-blue-300/90 font-medium">
                                                        {hasPhoto && <ImageIcon size={10} className="text-cyan-400 shrink-0" />}
                                                        <FileText size={10} className="text-blue-400 shrink-0" />
                                                        <span className="truncate max-w-[50px]">Laporan</span>
                                                      </div>
                                                    </button>
                                                  </td>
                                                )
                                              } else {
                                                // GREEN (Scan Wajah Berhasil / Hadir)
                                                return (
                                                  <td key={slot.id || jamKey} className="py-2 px-1 text-center">
                                                    <button
                                                      onClick={() => setSelectedScan(scan)}
                                                      className="w-full p-1.5 rounded-lg bg-emerald-950/50 border border-emerald-500/40 hover:border-cyan-400 hover:bg-cyan-950/60 transition flex flex-col items-center justify-center gap-0.5 group shadow-sm"
                                                      title="Scan Wajah Berhasil (Klik untuk detail foto & GPS)"
                                                    >
                                                      <span className="font-extrabold text-emerald-300 text-[11px] group-hover:text-cyan-300">
                                                        {scanTime.slice(0, 5)}
                                                      </span>
                                                      <div className="flex items-center gap-1 text-[9px] text-slate-400">
                                                        {hasPhoto && <ImageIcon size={10} className="text-cyan-400 shrink-0" />}
                                                        {scan.lokasi_kerja ? (
                                                          <span className="truncate max-w-[55px] text-slate-300 font-medium">{scan.lokasi_kerja}</span>
                                                        ) : (
                                                          <span className="text-emerald-400/70">Hadir</span>
                                                        )}
                                                      </div>
                                                    </button>
                                                  </td>
                                                )
                                              }
                                            } else {
                                              // TERLEWAT / LEWAT ABSEN (RED BADGE)
                                              return (
                                                <td key={slot.id || jamKey} className="py-2 px-1 text-center">
                                                  <div className="w-full p-1.5 rounded-lg bg-rose-950/60 border border-rose-500/50 text-rose-400 text-center shadow-sm">
                                                    <div className="flex items-center justify-center gap-0.5 text-[10px] font-black">
                                                      <X size={10} className="stroke-[3]" />
                                                      <span>Lewat</span>
                                                    </div>
                                                    <div className="text-[8px] text-rose-400/80 font-medium">Terlewat</div>
                                                  </div>
                                                </td>
                                              )
                                            }
                                          })}
                                          <td className="py-2.5 px-3 text-center font-mono font-bold text-xs">
                                            <span className={isLengkap ? 'text-emerald-400' : 'text-amber-400'}>
                                              {w.verifiedCount}/{w.expectedCount}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3 text-center">
                                            <span className={`inline-block text-[10px] font-extrabold px-2.5 py-1 rounded-full ${
                                              isLengkap
                                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                            }`}>
                                              {isLengkap ? 'LENGKAP' : 'BELUM LENGKAP'}
                                            </span>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          /* ================= KARTU TIMELINE VIEW ================= */
                          <div className="space-y-4">
                            {category.groups.map(({ groupName, workers }) => (
                              <div key={groupName} className="space-y-2">
                                <div className="text-xs font-bold text-cyan-400 flex items-center justify-between px-1">
                                  <span>MANDOR / REGU: {groupName}</span>
                                  <span className="text-slate-500 font-mono text-[10px]">{workers.length} Pekerja</span>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  {workers.map(w => {
                                    const isLengkap = w.computedStatus === 'LENGKAP'
                                    return (
                                      <div key={w.id || w.nama} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                                        <div className="flex items-start justify-between gap-2">
                                          <div>
                                            <div className="font-bold text-white text-sm">{w.nama}</div>
                                            {w.karyawan?.jabatan && (
                                              <div className="text-[11px] text-cyan-300 font-medium">{w.karyawan.jabatan}</div>
                                            )}
                                          </div>
                                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                            isLengkap
                                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                          }`}>
                                            {w.verifiedCount}/{w.expectedCount} {isLengkap ? 'LENGKAP' : 'BELUM'}
                                          </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-1.5">
                                          {category.slots.map(slot => {
                                            const jamKey = slot.normalizedJam
                                            const item = w.slotStatusMap ? w.slotStatusMap[jamKey] : null
                                            if (!item) return null

                                            const isLapor = item.type === 'lapor' ||
                                              item.data?.metode === 'laporan' ||
                                              (item.data?.lokasi_kerja || '').toLowerCase().includes('lapor') ||
                                              Boolean(item.data?.is_laporan_terlewat) ||
                                              Boolean(item.data?.laporan_id)

                                            if (item.type === 'scan' || item.type === 'lapor') {
                                              const scan = item.data || {}
                                              const scanTime = scan.waktu_scan
                                                ? formatScanTime(scan.waktu_scan, scan.client_tz || projectTz)
                                                : ''

                                              if (isLapor) {
                                                return (
                                                  <button
                                                    key={slot.id || jamKey}
                                                    onClick={() => scan.id ? setSelectedScan(scan) : null}
                                                    className="p-1.5 rounded-lg bg-blue-950/70 border border-blue-500/60 hover:border-cyan-400 text-center transition"
                                                    title="Lapor Terlewat Disetujui"
                                                  >
                                                    <div className="text-[9px] text-blue-300/80">{slot.normalizedJam}</div>
                                                    <div className="text-[10px] font-bold text-blue-300 flex items-center justify-center gap-1">
                                                      <FileText size={10} />
                                                      <span>{scanTime ? scanTime.slice(0, 5) : 'Lapor'}</span>
                                                    </div>
                                                  </button>
                                                )
                                              } else {
                                                return (
                                                  <button
                                                    key={slot.id || jamKey}
                                                    onClick={() => setSelectedScan(scan)}
                                                    className="p-1.5 rounded-lg bg-emerald-950/50 border border-emerald-500/40 hover:border-cyan-400 text-center transition"
                                                    title="Scan Wajah Berhasil"
                                                  >
                                                    <div className="text-[9px] text-slate-400">{slot.normalizedJam}</div>
                                                    <div className="text-[10px] font-bold text-emerald-300">{scanTime.slice(0, 5)}</div>
                                                  </button>
                                                )
                                              }
                                            } else {
                                              return (
                                                <div key={slot.id || jamKey} className="p-1.5 rounded-lg bg-rose-950/50 border border-rose-500/40 text-center">
                                                  <div className="text-[9px] text-slate-400">{slot.normalizedJam}</div>
                                                  <div className="text-[10px] font-bold text-rose-400">❌ Lewat</div>
                                                </div>
                                              )
                                            }
                                          })}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                ) : (
                  <div className="p-12 text-center bg-slate-950/60 rounded-2xl border border-slate-800">
                    <ScanFace size={36} className="mx-auto text-slate-600 mb-2" />
                    <p className="text-slate-400 text-sm font-medium">Tidak ada data presensi untuk shift yang dipilih</p>
                  </div>
                )}
              </div>

              {/* Table Legend */}
              <div className="p-3 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded bg-emerald-500/40 border border-emerald-500" />
                    <span className="text-slate-300">Scan Wajah Berhasil (Hadir)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded bg-blue-500/40 border border-blue-500" />
                    <span className="text-slate-300">Lapor Terlewat (Disetujui)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded bg-rose-500/40 border border-rose-500" />
                    <span className="text-rose-400 font-bold">Terlewat / Lewat Absen</span>
                  </div>
                </div>
                <span className="text-slate-500">Klik kotak jam untuk melihat detail foto & GPS</span>
              </div>
            </div>
          ) : (
            <div className="card p-16 text-center border border-slate-800 bg-slate-900/90 shadow-xl">
              <Calendar size={40} className="mx-auto text-gray-500 mb-3" />
              <p className="text-gray-300 font-bold text-base">Pilih Tanggal</p>
              <p className="text-gray-500 text-xs mt-1">Klik tanggal dari kalender di sebelah kiri untuk melihat rekap absensi per jam</p>
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
              {Boolean((selectedScan?.lokasi_kerja || '').toLowerCase().includes('lapor') || selectedScan?.metode === 'laporan' || selectedScan?.laporan_id) ? (
                <div className="flex items-center gap-2">
                  <FileText size={18} className="text-blue-500" />
                  <span className="font-semibold text-gray-900">Detail Laporan Terlewat</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <ScanFace size={18} className="text-cyan-500" />
                  <span className="font-semibold text-gray-900">Detail Scan Wajah</span>
                </div>
              )}
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
                const sRadius = Number(siteConfig?.radius || 1000)
                const geoCheck = isLocationOutsideGeofence(selectedScan.gps_lat, selectedScan.gps_lng, sLat, sLng, sRadius, selectedScan.gps_accuracy)
                const isOffsite = geoCheck.isOutside || selectedScan?.di_luar_lokasi
                const scanDist = geoCheck.effectiveDistanceMeters

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
