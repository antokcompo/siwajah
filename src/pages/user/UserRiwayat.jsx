import { useState, useEffect } from 'react'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { getPendingScans } from '../../lib/offlineQueue'
import { onSyncChange } from '../../lib/syncManager'
import { 
  ChevronLeft, ChevronRight, WifiOff, Clock, 
  CheckCircle2, XCircle, Info, X, Eye, Calendar
} from 'lucide-react'

export default function UserRiwayat() {
  const { karyawan } = useUserAuth()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [data, setData] = useState([])
  const [slotsList, setSlotsList] = useState([])
  const [regularSlotsList, setRegularSlotsList] = useState([])
  const [pendingScans, setPendingScans] = useState([])
  const [loading, setLoading] = useState(true)

  // State for slot detail modal
  const [selectedDateDetail, setSelectedDateDetail] = useState(null)
  const [detailSlotsData, setDetailSlotsData] = useState([])

  const bulan = currentDate.getMonth() + 1
  const tahun = currentDate.getFullYear()

  useEffect(() => { load() }, [bulan, tahun])

  useEffect(() => {
    loadPending()
    const unsub = onSyncChange(status => {
      if (!status.syncing) loadPending()
    })
    return unsub
  }, [])

  async function load() {
    setLoading(true)
    const padBulan = String(bulan).padStart(2, '0')
    const startDate = `${tahun}-${padBulan}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const endDate = `${tahun}-${padBulan}-${String(lastDay).padStart(2, '0')}`

    const [harianRes, scanRes, laporanRes, slotRes, lemburDaftarRes] = await Promise.all([
      supabase
        .from('absen_harian')
        .select('tanggal, jam_masuk, jam_pulang, status, jam_lembur, status_lembur')
        .eq('karyawan_id', karyawan.id)
        .gte('tanggal', startDate)
        .lte('tanggal', endDate)
        .order('tanggal', { ascending: false }),
      supabase
        .from('absen_scan_wajah')
        .select('tanggal, slot_id, waktu_scan')
        .eq('karyawan_id', karyawan.id)
        .gte('tanggal', startDate)
        .lte('tanggal', endDate),
      supabase
        .from('absen_laporan_terlewat')
        .select('tanggal, slot_id, status, alasan')
        .eq('karyawan_id', karyawan.id)
        .gte('tanggal', startDate)
        .lte('tanggal', endDate),
      supabase
        .from('absen_jadwal_slot')
        .select('*')
        .eq('aktif', true)
        .order('jam', { ascending: true }),
      supabase
        .from('absen_daftar_lembur')
        .select('tanggal, status')
        .eq('karyawan_id', karyawan.id)
        .gte('tanggal', startDate)
        .lte('tanggal', endDate)
    ])

    const harian = harianRes.data || []
    const scans = scanRes.data || []
    const laporans = laporanRes.data || []
    const allSlots = slotRes.data || []
    const daftarLembur = lemburDaftarRes.data || []

    // Separate regular non-lembur slots vs lembur slots
    const regularSlots = allSlots.filter(s => s.jenis !== 'LEMBUR' && !s.label?.toLowerCase().includes('lembur'))
    const lemburSlots = allSlots.filter(s => s.jenis === 'LEMBUR' || s.label?.toLowerCase().includes('lembur'))
    const lemburSlotIds = new Set(lemburSlots.map(s => s.id))

    setSlotsList(allSlots)
    setRegularSlotsList(regularSlots)

    // Set of dates where employee has registered/approved overtime
    const datesWithRegisteredLembur = new Set(
      daftarLembur.filter(d => d.status !== 'REJECTED').map(d => d.tanggal)
    )

    // Map scans & laporans by date
    const statsByDate = {}
    scans.forEach(s => {
      if (!statsByDate[s.tanggal]) {
        statsByDate[s.tanggal] = { verifiedRegular: new Set(), verifiedLembur: new Set(), pendingCount: 0, scansMap: {}, laporansMap: {} }
      }
      statsByDate[s.tanggal].scansMap[s.slot_id] = s
      if (lemburSlotIds.has(s.slot_id)) {
        statsByDate[s.tanggal].verifiedLembur.add(s.slot_id)
      } else {
        statsByDate[s.tanggal].verifiedRegular.add(s.slot_id)
      }
    })

    laporans.forEach(l => {
      if (!statsByDate[l.tanggal]) {
        statsByDate[l.tanggal] = { verifiedRegular: new Set(), verifiedLembur: new Set(), pendingCount: 0, scansMap: {}, laporansMap: {} }
      }
      statsByDate[l.tanggal].laporansMap[l.slot_id] = l
      if (l.status === 'APPROVED') {
        if (lemburSlotIds.has(l.slot_id)) {
          statsByDate[l.tanggal].verifiedLembur.add(l.slot_id)
        } else {
          statsByDate[l.tanggal].verifiedRegular.add(l.slot_id)
        }
      } else if (l.status === 'PENDING') {
        statsByDate[l.tanggal].pendingCount += 1
      }
    })

    const enriched = harian.map(h => {
      const st = statsByDate[h.tanggal] || { verifiedRegular: new Set(), verifiedLembur: new Set(), pendingCount: 0, scansMap: {}, laporansMap: {} }
      const verifiedRegCount = st.verifiedRegular.size
      const verifiedLemburCount = st.verifiedLembur.size
      const pendingCount = st.pendingCount

      // Determine if overtime slots apply to this date
      const hasRegisteredLembur = datesWithRegisteredLembur.has(h.tanggal)
      const hasLemburScan = verifiedLemburCount > 0 || (st.laporansMap && lemburSlots.some(s => st.laporansMap[s.id]))
      const showLemburOnDate = hasRegisteredLembur || hasLemburScan

      // Active master slots for this date (excludes lembur slots if employee has no overtime on this day!)
      const activeMasterSlots = showLemburOnDate ? allSlots : regularSlots
      const totalSlots = activeMasterSlots.length
      const totalVerifiedCount = verifiedRegCount + (showLemburOnDate ? verifiedLemburCount : 0)

      // Completeness is based on regular 6 slots
      const isComplete = verifiedRegCount >= (regularSlots.length || 6)

      return {
        ...h,
        verifiedCount: totalVerifiedCount,
        verifiedRegCount,
        verifiedLemburCount,
        pendingCount,
        isComplete,
        totalSlots,
        showLemburOnDate,
        activeMasterSlots,
        scansMap: st.scansMap,
        laporansMap: st.laporansMap
      }
    })

    setData(enriched)
    setLoading(false)
  }

  async function loadPending() {
    const scans = await getPendingScans()
    const mine = scans.filter(s => s.karyawan_id === karyawan.id)
    setPendingScans(mine)
  }

  function prevMonth() { setCurrentDate(new Date(tahun, bulan - 2, 1)) }
  function nextMonth() { setCurrentDate(new Date(tahun, bulan, 1)) }

  function openSlotDetail(item) {
    setSelectedDateDetail(item)

    // Only map active master slots for this day (excludes lembur slots if no lembur on this day!)
    const activeSlots = item.activeMasterSlots || regularSlotsList

    const detail = activeSlots.map(s => {
      const sc = item.scansMap?.[s.id]
      const lap = item.laporansMap?.[s.id]

      let status = 'MISSED' // Terlewat
      let scanTime = null

      if (sc) {
        status = 'VERIFIED'
        const wObj = new Date(sc.waktu_scan)
        scanTime = !isNaN(wObj.getTime())
          ? wObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          : s.jam.slice(0, 5)
      } else if (lap) {
        if (lap.status === 'APPROVED') {
          status = 'VERIFIED'
          scanTime = 'Laporan Disetujui'
        } else if (lap.status === 'PENDING') {
          status = 'PENDING'
          scanTime = 'Menunggu Approval'
        } else if (lap.status === 'REJECTED') {
          status = 'MISSED'
          scanTime = 'Laporan Ditolak'
        }
      }

      return {
        slot: s,
        status,
        scanTime,
        alasan: lap?.alasan
      }
    })
    setDetailSlotsData(detail)
  }

  const namaBulan = currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

  const summary = {
    lengkap: data.filter(d => d.isComplete).length,
    tidak_lengkap: data.filter(d => !d.isComplete && d.verifiedCount > 0).length,
    tidak_ada: data.filter(d => d.verifiedCount === 0).length,
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Pending offline scans */}
      {pendingScans.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-2">
            <WifiOff size={14} className="text-amber-400" />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Menunggu Sinkronisasi ({pendingScans.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {pendingScans.map(scan => {
              const waktu = new Date(scan.waktu_scan)
              const tanggal = waktu.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })
              const jam = waktu.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              return (
                <div
                  key={scan.id}
                  className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                      <Clock size={16} className="text-amber-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-100">
                        {tanggal} • {jam}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {scan.slot_jam?.slice(0, 5)} — {scan.slot_label}
                        {scan.lokasi_kerja && <span> • {scan.lokasi_kerja}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[10px] font-semibold text-amber-400">Offline</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 hover:bg-slate-800/60 rounded-xl transition-colors">
          <ChevronLeft size={18} className="text-slate-400" />
        </button>
        <span className="font-bold text-slate-100 text-sm capitalize flex items-center gap-1.5">
          <Calendar size={15} className="text-blue-400" /> {namaBulan}
        </span>
        <button onClick={nextMonth} className="p-2 hover:bg-slate-800/60 rounded-xl transition-colors">
          <ChevronRight size={18} className="text-slate-400" />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3 text-center">
          <div className="text-xl font-extrabold text-emerald-400">{summary.lengkap}</div>
          <div className="text-[10px] font-semibold text-slate-400">Lengkap</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 text-center">
          <div className="text-xl font-extrabold text-amber-400">{summary.tidak_lengkap}</div>
          <div className="text-[10px] font-semibold text-slate-400">Tidak Lengkap</div>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3 text-center">
          <div className="text-xl font-extrabold text-rose-400">{summary.tidak_ada}</div>
          <div className="text-[10px] font-semibold text-slate-400">Tidak Ada</div>
        </div>
      </div>

      {/* List Daily History */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm bg-slate-900/40 border border-slate-800/80 rounded-2xl">
          Belum ada data presensi pada bulan ini
        </div>
      ) : (
        <div className="space-y-2.5">
          {data.map(d => {
            const tgl = new Date(d.tanggal + 'T00:00')
            const isFull = d.isComplete

            return (
              <div 
                key={d.tanggal}
                onClick={() => openSlotDetail(d)}
                className={`border rounded-2xl p-3.5 flex items-center justify-between cursor-pointer transition-all hover:border-blue-500/40 active:scale-[0.99] ${
                  isFull 
                    ? 'bg-slate-900/80 border-emerald-500/30 text-slate-200'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300'
                }`}
              >
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    {tgl.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' })}
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700">
                      {d.verifiedRegCount} / {regularSlotsList.length || 6} Slot
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    {d.jam_masuk?.slice(0, 5) || '—'} s/d {d.jam_pulang?.slice(0, 5) || '—'}
                    {d.jam_lembur > 0 && <span className="text-amber-400 ml-2 font-bold">+{d.jam_lembur}j lembur</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isFull ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-[11px]">
                      <CheckCircle2 size={12} /> Lengkap
                    </span>
                  ) : d.pendingCount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold text-[11px]">
                      <Clock size={12} /> {d.pendingCount} Pending
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 font-bold text-[11px]">
                      <Info size={12} /> Tidak Lengkap
                    </span>
                  )}
                  <Eye size={16} className="text-slate-500 hover:text-blue-400" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Detail Presensi per Hari */}
      {selectedDateDetail && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            {/* Header Modal */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <Calendar size={18} className="text-blue-400" /> Rincian Presensi Harian
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  {new Date(selectedDateDetail.tanggal + 'T00:00').toLocaleDateString('id-ID', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </p>
              </div>
              <button 
                onClick={() => setSelectedDateDetail(null)}
                className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Banner Ringkasan Slot */}
            <div className="bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Slot Disetujui</span>
                <span className="text-sm font-extrabold text-cyan-300">
                  {selectedDateDetail.verifiedRegCount} / {regularSlotsList.length || 6} Slot Reguler
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Bobot Gaji Hari Ini</span>
                <span className="text-sm font-extrabold text-emerald-400">
                  {Math.round((selectedDateDetail.verifiedRegCount / (regularSlotsList.length || 6)) * 100)}% ({ (selectedDateDetail.verifiedRegCount / (regularSlotsList.length || 6)).toFixed(2) } Hari)
                </span>
              </div>
            </div>

            {/* List Slot Breakdown (Overtime slots hidden unless registered) */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Detail Slot Presensi {selectedDateDetail.showLemburOnDate ? '(Termasuk Lembur)' : 'Reguler (6 Slot)'}
              </h4>
              {detailSlotsData.map((item, idx) => {
                return (
                  <div 
                    key={item.slot.id || idx}
                    className="bg-slate-950/50 border border-slate-800/80 rounded-2xl p-3 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-200 flex items-center gap-2">
                        <span className="text-cyan-400 font-mono font-extrabold">{item.slot.jam.slice(0, 5)}</span>
                        <span>{item.slot.label}</span>
                      </div>
                      {item.alasan && (
                        <div className="text-[10px] text-slate-400 italic">Laporan: "{item.alasan}"</div>
                      )}
                    </div>

                    <div>
                      {item.status === 'VERIFIED' ? (
                        <span className="px-2.5 py-1 rounded-full font-bold text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                          <CheckCircle2 size={12} /> {item.scanTime || 'Hadir'}
                        </span>
                      ) : item.status === 'PENDING' ? (
                        <span className="px-2.5 py-1 rounded-full font-bold text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                          <Clock size={12} /> Pending Approval
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full font-bold text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30 inline-flex items-center gap-1">
                          <XCircle size={12} /> Terlewat
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer Modal */}
            <button
              onClick={() => setSelectedDateDetail(null)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-2xl transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
