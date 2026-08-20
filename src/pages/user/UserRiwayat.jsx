import { useState, useEffect } from 'react'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { getPendingScans } from '../../lib/offlineQueue'
import { onSyncChange } from '../../lib/syncManager'
import { 
  ChevronLeft, ChevronRight, WifiOff, Clock, 
  CheckCircle2, XCircle, Info, X, Eye, Calendar, FileWarning, Send
} from 'lucide-react'

export default function UserRiwayat() {
  const { karyawan, outdoorMode } = useUserAuth()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [data, setData] = useState([])
  const [slotsList, setSlotsList] = useState([])
  const [regularSlotsList, setRegularSlotsList] = useState([])
  const [pendingScans, setPendingScans] = useState([])
  const [loading, setLoading] = useState(true)

  // State for slot detail modal
  const [selectedDateDetail, setSelectedDateDetail] = useState(null)
  const [detailSlotsData, setDetailSlotsData] = useState([])

  // State for Lapor Terlewat inside modal
  const [laporModalSlot, setLaporModalSlot] = useState(null)
  const [laporAlasan, setLaporAlasan] = useState('')
  const [submittingLapor, setSubmittingLapor] = useState(false)
  const [laporError, setLaporError] = useState('')
  const [laporSuccess, setLaporSuccess] = useState('')

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

    // Set of dates where employee was registered for overtime
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

      // Employee has overtime if registered in daftar_lembur or has overtime scans/reports
      const isRegisteredLembur = datesWithRegisteredLembur.has(h.tanggal)
      const hasLemburActivity = verifiedLemburCount > 0 || (st.laporansMap && lemburSlots.some(s => st.laporansMap[s.id]))
      const showLemburOnDate = isRegisteredLembur || hasLemburActivity

      // Active master slots for this date:
      const activeMasterSlots = showLemburOnDate ? allSlots : regularSlots

      const totalSlots = activeMasterSlots.length
      const totalVerifiedCount = verifiedRegCount + verifiedLemburCount

      // Completeness is based on 6 regular slots
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

    // Only map active master slots for this day (includes lembur if registered)
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

  async function handleLaporSubmit(e) {
    e.preventDefault()
    if (!laporAlasan || laporAlasan.trim().length < 5) {
      setLaporError('Alasan harus minimal 5 karakter')
      return
    }

    setSubmittingLapor(true)
    setLaporError('')

    try {
      const { data: resData, error: rpcErr } = await supabase.rpc('absen_lapor_terlewat', {
        p_karyawan_id: karyawan.id,
        p_tanggal: selectedDateDetail.tanggal,
        p_slot_id: laporModalSlot.id,
        p_alasan: laporAlasan.trim(),
      })

      if (rpcErr) throw rpcErr
      if (resData?.error) throw new Error(resData.error)

      setLaporSuccess('Laporan absen terlewat berhasil dikirim!')
      setLaporModalSlot(null)
      setLaporAlasan('')
      
      // Refresh modal detail
      if (selectedDateDetail) {
        setSelectedDateDetail(null)
      }
      load()
      setTimeout(() => setLaporSuccess(''), 4000)
    } catch (err) {
      setLaporError(err.message)
    } finally {
      setSubmittingLapor(false)
    }
  }

  const namaBulan = currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

  const summary = {
    lengkap: data.filter(d => d.isComplete).length,
    tidak_lengkap: data.filter(d => !d.isComplete && d.verifiedCount > 0).length,
    tidak_ada: data.filter(d => d.verifiedCount === 0).length,
  }

  return (
    <div className={`px-4 py-4 space-y-4 min-h-screen transition-colors ${outdoorMode ? 'bg-black text-white' : 'bg-slate-950 text-slate-100'}`}>
      {/* Toast Notification */}
      {laporSuccess && (
        <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-3 rounded-2xl text-xs font-bold flex items-center justify-between animate-in fade-in">
          <span>{laporSuccess}</span>
          <X size={16} className="cursor-pointer" onClick={() => setLaporSuccess('')} />
        </div>
      )}

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
        <div className={`p-3 text-center rounded-2xl border transition-all ${
          outdoorMode
            ? 'bg-emerald-950/90 border-2 border-emerald-400 text-white shadow-lg'
            : 'bg-emerald-500/10 border border-emerald-500/20'
        }`}>
          <div className="text-xl font-black text-emerald-400">{summary.lengkap}</div>
          <div className={`text-[11px] font-bold ${outdoorMode ? 'text-white' : 'text-slate-400'}`}>Lengkap</div>
        </div>
        <div className={`p-3 text-center rounded-2xl border transition-all ${
          outdoorMode
            ? 'bg-amber-950/90 border-2 border-amber-400 text-white shadow-lg'
            : 'bg-amber-500/10 border border-amber-500/20'
        }`}>
          <div className="text-xl font-black text-amber-400">{summary.tidak_lengkap}</div>
          <div className={`text-[11px] font-bold ${outdoorMode ? 'text-white' : 'text-slate-400'}`}>Tidak Lengkap</div>
        </div>
        <div className={`p-3 text-center rounded-2xl border transition-all ${
          outdoorMode
            ? 'bg-rose-950/90 border-2 border-rose-400 text-white shadow-lg'
            : 'bg-rose-500/10 border border-rose-500/20'
        }`}>
          <div className="text-xl font-black text-rose-400">{summary.tidak_ada}</div>
          <div className={`text-[11px] font-bold ${outdoorMode ? 'text-white' : 'text-slate-400'}`}>Tidak Ada</div>
        </div>
      </div>

      {/* List Daily History */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-slate-300 text-sm bg-slate-900/60 border border-slate-800 rounded-2xl font-bold">
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
                className={`border rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all hover:border-cyan-400 active:scale-[0.99] ${
                  outdoorMode
                    ? isFull
                      ? 'bg-slate-900 border-2 border-emerald-400 shadow-lg text-white'
                      : 'bg-slate-900 border-2 border-cyan-400/80 shadow-lg text-white'
                    : isFull
                    ? 'bg-slate-900/80 border-emerald-500/40 text-slate-200'
                    : 'bg-slate-900/80 border-slate-800 text-slate-300'
                }`}
              >
                <div className="space-y-1">
                  <div className="text-sm font-black text-white flex items-center gap-2">
                    {tgl.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' })}
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-950 text-cyan-300 border border-cyan-400/40">
                      {d.verifiedRegCount} / {regularSlotsList.length || 6} Slot Reguler
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 font-mono font-bold">
                    {d.jam_masuk?.slice(0, 5) || '—'} s/d {d.jam_pulang?.slice(0, 5) || '—'}
                    {d.jam_lembur > 0 && <span className="text-amber-300 ml-2 font-black">+{d.jam_lembur}j lembur</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isFull ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400 font-black text-xs shadow-sm">
                      <CheckCircle2 size={13} /> Lengkap
                    </span>
                  ) : d.pendingCount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400 font-black text-xs shadow-sm">
                      <Clock size={13} /> {d.pendingCount} Pending
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/60 font-black text-xs shadow-sm">
                      <Info size={13} /> Tidak Lengkap
                    </span>
                  )}
                  <Eye size={18} className="text-cyan-400 hover:text-white shrink-0 ml-1" />
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

            {/* List Slot Breakdown */}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Detail Slot Presensi {selectedDateDetail.showLemburOnDate ? '(Termasuk Jadwal Lembur)' : 'Reguler (6 Slot)'}
              </h4>
              {detailSlotsData.map((item, idx) => {
                const todayObj = new Date()
                todayObj.setHours(0,0,0,0)
                const slotDateObj = new Date(selectedDateDetail.tanggal + 'T00:00')
                const diffDays = Math.round((todayObj - slotDateObj) / (1000 * 60 * 60 * 24))

                const isLemburSlotItem = item.slot.jenis === 'LEMBUR' || item.slot.label?.toLowerCase().includes('lembur')
                
                // Allow Lapor Terlewat:
                // - Regular slots: Same day (diffDays === 0)
                // - Overtime slots: Same day OR H+1 (diffDays === 0 || diffDays === 1)
                const canLapor = item.status === 'MISSED' && (
                  (!isLemburSlotItem && diffDays === 0) ||
                  (isLemburSlotItem && (diffDays === 0 || diffDays === 1))
                )

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

                    <div className="flex items-center gap-2">
                      {item.status === 'VERIFIED' ? (
                        <span className="px-2.5 py-1 rounded-full font-bold text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                          <CheckCircle2 size={12} /> {item.scanTime || 'Hadir'}
                        </span>
                      ) : item.status === 'PENDING' ? (
                        <span className="px-2.5 py-1 rounded-full font-bold text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                          <Clock size={12} /> Pending Approval
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30 inline-flex items-center gap-1">
                            <XCircle size={11} /> Terlewat
                          </span>
                          {canLapor && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setLaporModalSlot(item.slot)
                              }}
                              className="px-2 py-0.5 rounded-full font-bold text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors inline-flex items-center gap-1"
                            >
                              <FileWarning size={11} /> Lapor (H+1)
                            </button>
                          )}
                        </div>
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

      {/* Modal Form Submit Lapor Terlewat */}
      {laporModalSlot && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  <FileWarning size={16} className="text-amber-400" /> Ajukan Laporan Terlewat
                </h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Slot {laporModalSlot.jam?.slice(0,5)} ({laporModalSlot.label})
                </p>
              </div>
              <button onClick={() => setLaporModalSlot(null)} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400">
                <X size={18} />
              </button>
            </div>

            {laporError && (
              <div className="bg-rose-500/20 border border-rose-500/30 text-rose-300 p-2.5 rounded-xl text-xs">
                {laporError}
              </div>
            )}

            <form onSubmit={handleLaporSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Alasan Keterlambatan / Laporan Terlewat:
                </label>
                <textarea
                  rows={3}
                  value={laporAlasan}
                  onChange={e => setLaporAlasan(e.target.value)}
                  placeholder="Tuliskan alasan lengkap (min. 5 karakter)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLaporModalSlot(null)}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submittingLapor}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                >
                  {submittingLapor ? 'Mengirim...' : <><Send size={13} /> Kirim Laporan</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
