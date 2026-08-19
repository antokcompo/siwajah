import { useEffect, useState, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Calendar, ScanFace, MapPin, MapPinOff, Clock, X, Image, ExternalLink, ZoomIn } from 'lucide-react'

const statusColor = {
  LENGKAP: 'bg-emerald-100 text-emerald-700',
  TANPA_PULANG: 'bg-amber-100 text-amber-700',
  TANPA_MASUK: 'bg-amber-100 text-amber-700',
  HANYA_SCAN_TENGAH: 'bg-orange-100 text-orange-700',
  TIDAK_ADA_SCAN: 'bg-gray-100 text-gray-500',
  INSIDEN: 'bg-red-100 text-red-700',
}

const statusLabel = {
  LENGKAP: 'Lengkap',
  TANPA_PULANG: 'Tanpa Pulang',
  TANPA_MASUK: 'Tanpa Masuk',
  HANYA_SCAN_TENGAH: 'Scan Tengah',
  TIDAK_ADA_SCAN: 'Tidak Ada',
  INSIDEN: 'Insiden',
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
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
}

function confidenceLevel(c) {
  if (c >= 0.75) return { label: 'Tinggi', cls: 'text-emerald-600' }
  if (c >= 0.55) return { label: 'Sedang', cls: 'text-amber-600' }
  return { label: 'Rendah', cls: 'text-red-600' }
}

function formatScanTime(waktu, tz) {
  const d = new Date(waktu)
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: tz })
  const label = tzShortName[tz] || ''
  return `${time} ${label}`
}

function formatScanTimeFull(waktu, tz) {
  const d = new Date(waktu)
  const time = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz })
  const label = tzShortName[tz] || ''
  return `${time} ${label}`
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
  const [selectedScan, setSelectedScan] = useState(null)
  const [zoomPhoto, setZoomPhoto] = useState(null)
  const [projectTz, setProjectTz] = useState('Asia/Jayapura')

  const bulan = currentDate.getMonth() + 1
  const tahun = currentDate.getFullYear()

  useEffect(() => {
    loadTimezone()
  }, [])

  useEffect(() => { loadMonth() }, [bulan, tahun])
  useEffect(() => {
    if (selectedDate) {
      loadDetail(selectedDate)
      loadScanWajah(selectedDate)
    }
  }, [selectedDate, filter])

  async function loadTimezone() {
    const { data } = await supabase
      .from('absen_konfigurasi')
      .select('value')
      .eq('key', 'zona_waktu')
      .maybeSingle()
    if (data?.value) setProjectTz(data.value)
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
    const { data, error } = await supabase.rpc('absen_detail_harian', params)
    if (error) {
      let q = supabase
        .from('absen_harian')
        .select('*, absen_karyawan(nama, jabatan, atasan_id)')
        .eq('tanggal', date)
      if (filter !== 'semua') q = q.eq('status', filter)
      const { data: fallback } = await q
      setDetail(fallback || [])
    } else {
      setDetail((data || []).map(d => ({
        ...d,
        absen_karyawan: { nama: d.karyawan_nama, jabatan: d.karyawan_jabatan, atasan_id: d.atasan_id }
      })))
    }
  }

  async function loadScanWajah(date) {
    const { data, error } = await supabase
      .from('absen_scan_wajah')
      .select('*, absen_karyawan(nama, jabatan, atasan_id), absen_jadwal_slot(label, jam, jenis)')
      .eq('tanggal', date)
      .order('waktu_scan', { ascending: true })
    if (error) {
      setScanData([])
    } else {
      setScanData(data || [])
    }
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
    const groups = {}
    detail.forEach(d => {
      const atasanId = d.absen_karyawan?.atasan_id
      const groupName = atasanId && mandorMap[atasanId] ? mandorMap[atasanId] : 'Harian Kantor'
      if (!groups[groupName]) groups[groupName] = []
      groups[groupName].push(d)
    })
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Harian Kantor') return 1
      if (b === 'Harian Kantor') return -1
      return a.localeCompare(b)
    })
  }, [detail, mandorMap])

  const groupedScans = useMemo(() => {
    const mandorGroups = {}
    scanData.forEach(s => {
      const atasanId = s.absen_karyawan?.atasan_id
      const groupName = atasanId && mandorMap[atasanId] ? mandorMap[atasanId] : 'Harian Kantor'
      if (!mandorGroups[groupName]) mandorGroups[groupName] = {}
      const nama = s.absen_karyawan?.nama || 'Unknown'
      if (!mandorGroups[groupName][nama]) mandorGroups[groupName][nama] = { karyawan: s.absen_karyawan, scans: [] }
      mandorGroups[groupName][nama].scans.push(s)
    })
    return Object.entries(mandorGroups)
      .sort(([a], [b]) => {
        if (a === 'Harian Kantor') return 1
        if (b === 'Harian Kantor') return -1
        return a.localeCompare(b)
      })
      .map(([groupName, workers]) => ({
        groupName,
        workers: Object.entries(workers).sort(([a], [b]) => a.localeCompare(b)),
      }))
  }, [scanData, mandorMap])

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
            <>
              {/* Fingerprint table */}
              <div className="card">
                <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="font-semibold text-gray-900">{format(new Date(selectedDate + 'T00:00'), 'EEEE, d MMMM yyyy', { locale: localeId })}</span>
                  <select value={filter} onChange={e => setFilter(e.target.value)} className="select-field text-sm">
                    <option value="semua">Semua Status</option>
                    {Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="table-scroll">
                  <table className="w-full text-sm">
                    <thead className="table-header">
                      <tr>
                        <th className="text-left px-5 py-3">Nama</th>
                        <th className="text-center px-4 py-3">Masuk</th>
                        <th className="text-center px-4 py-3">Pulang</th>
                        <th className="text-center px-4 py-3">Status</th>
                        <th className="text-center px-4 py-3">Lembur</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {groupedDetail.map(([groupName, items]) => (
                        <Fragment key={groupName}>
                          <tr className="bg-slate-50 border-t-2 border-slate-200">
                            <td colSpan={5} className="px-5 py-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{groupName}</span>
                                <span className="text-xs text-slate-400">{items.length} orang</span>
                              </div>
                            </td>
                          </tr>
                          {items.map(d => (
                            <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-5 py-3 font-medium text-gray-900">{d.absen_karyawan?.nama}</td>
                              <td className="px-4 py-3 text-center text-gray-600">{d.jam_masuk?.slice(0, 5) || '-'}</td>
                              <td className="px-4 py-3 text-center text-gray-600">{d.jam_pulang?.slice(0, 5) || '-'}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`badge ${statusColor[d.status]}`}>{statusLabel[d.status]}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {d.jam_lembur > 0 ? (
                                  <span className="text-orange-600 font-medium">{d.jam_lembur}j</span>
                                ) : <span className="text-gray-300">-</span>}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                      {detail.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">Tidak ada data</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Face scan timeline */}
              <div className="card">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <ScanFace size={18} className="text-cyan-500" />
                  <span className="font-semibold text-gray-900">Scan Wajah</span>
                  {scanData.length > 0 && (
                    <span className="text-xs text-gray-400 ml-auto">{scanData.length} scan</span>
                  )}
                </div>

                {groupedScans.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {groupedScans.map(({ groupName, workers }) => (
                      <Fragment key={groupName}>
                        <div className="px-5 py-2 bg-slate-50 border-t-2 border-slate-200">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{groupName}</span>
                            <span className="text-xs text-slate-400">{workers.length} orang</span>
                          </div>
                        </div>
                        {workers.map(([nama, group]) => (
                          <div key={nama} className="px-5 py-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-medium text-gray-900">{nama}</span>
                              <span className="text-[10px] text-gray-400">{group.karyawan?.jabatan}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {group.scans.map(scan => {
                                const scanTime = formatScanTime(scan.waktu_scan, scan.client_tz || projectTz)
                                const slotLabel = scan.absen_jadwal_slot?.label || ''
                                const jenis = scan.absen_jadwal_slot?.jenis || ''
                                const hasPhoto = !!scan.foto_url
                                const hasGps = scan.gps_lat && scan.gps_lng

                                return (
                                  <button
                                    key={scan.id}
                                    onClick={() => setSelectedScan(scan)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-gray-200 hover:border-cyan-400 hover:bg-cyan-50/50 transition-all text-xs group"
                                  >
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${slotColor[jenis] || 'bg-gray-400'}`} />
                                    <span className="font-medium text-gray-700">{scanTime}</span>
                                    <span className="text-gray-400">{slotLabel}</span>
                                    {hasPhoto && <Image size={10} className="text-blue-400" />}
                                    {hasGps && <MapPin size={10} className="text-emerald-500" />}
                                    {scan.di_luar_lokasi && <MapPinOff size={10} className="text-amber-400" />}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <ScanFace size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-400 text-sm">Tidak ada data scan wajah</p>
                  </div>
                )}
              </div>
            </>
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
                {selectedScan.di_luar_lokasi && (
                  <div className="flex items-center gap-1.5 text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    <MapPinOff size={14} className="shrink-0" />
                    Di luar lokasi proyek
                  </div>
                )}
              </div>

              {/* GPS */}
              {selectedScan.gps_lat && selectedScan.gps_lng && (
                <div className="border border-gray-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                      <MapPin size={14} className="text-emerald-500" />
                      Koordinat GPS
                    </div>
                    <a
                      href={`https://www.google.com/maps?q=${selectedScan.gps_lat},${selectedScan.gps_lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <ExternalLink size={12} />
                      Buka di Google Maps
                    </a>
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {Number(selectedScan.gps_lat).toFixed(7)}, {Number(selectedScan.gps_lng).toFixed(7)}
                  </div>
                </div>
              )}
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
