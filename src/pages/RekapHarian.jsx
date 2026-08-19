import { useEffect, useState, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

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

export default function RekapHarian() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [data, setData] = useState([])
  const [detail, setDetail] = useState([])
  const [mandorMap, setMandorMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('semua')

  const bulan = currentDate.getMonth() + 1
  const tahun = currentDate.getFullYear()

  useEffect(() => { loadMonth() }, [bulan, tahun])
  useEffect(() => { if (selectedDate) loadDetail(selectedDate) }, [selectedDate, filter])

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

  function prevMonth() { setCurrentDate(new Date(tahun, bulan - 2, 1)); setSelectedDate(null) }
  function nextMonth() { setCurrentDate(new Date(tahun, bulan, 1)); setSelectedDate(null) }

  const days = eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) })

  function getDayStatus(date) {
    const ds = format(date, 'yyyy-MM-dd')
    const dayData = data.filter(d => d.tanggal === ds)
    if (dayData.length === 0) return 'empty'
    if (dayData.some(d => d.is_insiden)) return 'insiden'
    if (dayData.some(d => !['LENGKAP','TIDAK_ADA_SCAN'].includes(d.status))) return 'koreksi'
    return 'ok'
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

  const namaBulan = format(currentDate, 'MMMM yyyy', { locale: localeId })

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
        <div className="lg:col-span-2 card">
          {selectedDate ? (
            <>
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
            </>
          ) : (
            <div className="p-16 text-center">
              <Calendar size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Pilih Tanggal</p>
              <p className="text-gray-400 text-sm mt-1">Klik tanggal dari kalender untuk melihat detail absensi</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
