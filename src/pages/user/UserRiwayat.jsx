import { useState, useEffect } from 'react'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { getPendingScans } from '../../lib/offlineQueue'
import { onSyncChange } from '../../lib/syncManager'
import { ChevronLeft, ChevronRight, WifiOff, Clock } from 'lucide-react'

const statusConfig = {
  LENGKAP: { label: 'Lengkap', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  TANPA_PULANG: { label: 'Tanpa Pulang', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  TANPA_MASUK: { label: 'Tanpa Masuk', color: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  HANYA_SCAN_TENGAH: { label: 'Scan Tengah', color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  TIDAK_ADA_SCAN: { label: 'Tidak Ada', color: 'bg-red-500/15 text-red-400 border-red-500/20' },
}

export default function UserRiwayat() {
  const { karyawan } = useUserAuth()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [data, setData] = useState([])
  const [pendingScans, setPendingScans] = useState([])
  const [loading, setLoading] = useState(true)

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
    const { data: harian } = await supabase
      .from('absen_harian')
      .select('tanggal, jam_masuk, jam_pulang, status, jam_lembur')
      .eq('karyawan_id', karyawan.id)
      .gte('tanggal', `${tahun}-${String(bulan).padStart(2, '0')}-01`)
      .lte('tanggal', `${tahun}-${String(bulan).padStart(2, '0')}-31`)
      .order('tanggal', { ascending: false })
    setData(harian || [])
    setLoading(false)
  }

  async function loadPending() {
    const scans = await getPendingScans()
    const mine = scans.filter(s => s.karyawan_id === karyawan.id)
    setPendingScans(mine)
  }

  function prevMonth() { setCurrentDate(new Date(tahun, bulan - 2, 1)) }
  function nextMonth() { setCurrentDate(new Date(tahun, bulan, 1)) }

  const namaBulan = currentDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

  const summary = {
    lengkap: data.filter(d => d.status === 'LENGKAP').length,
    tidak_ada: data.filter(d => d.status === 'TIDAK_ADA_SCAN').length,
    lainnya: data.filter(d => !['LENGKAP', 'TIDAK_ADA_SCAN'].includes(d.status)).length,
  }

  return (
    <div className="px-4 py-4">
      {/* Pending offline scans */}
      {pendingScans.length > 0 && (
        <div className="mb-4">
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
                  className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center justify-between"
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
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 hover:bg-white/10 rounded-lg">
          <ChevronLeft size={18} className="text-slate-400" />
        </button>
        <span className="font-semibold text-slate-100 capitalize">{namaBulan}</span>
        <button onClick={nextMonth} className="p-2 hover:bg-white/10 rounded-lg">
          <ChevronRight size={18} className="text-slate-400" />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-emerald-400">{summary.lengkap}</div>
          <div className="text-[10px] text-slate-500">Lengkap</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-amber-400">{summary.lainnya}</div>
          <div className="text-[10px] text-slate-500">Tidak Lengkap</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-red-400">{summary.tidak_ada}</div>
          <div className="text-[10px] text-slate-500">Tidak Ada</div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">Belum ada data bulan ini</div>
      ) : (
        <div className="space-y-2">
          {data.map(d => {
            const cfg = statusConfig[d.status] || statusConfig.TIDAK_ADA_SCAN
            const tgl = new Date(d.tanggal + 'T00:00')
            return (
              <div key={d.tanggal} className={`border rounded-xl p-3 flex items-center justify-between ${cfg.color}`}>
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    {tgl.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' })}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {d.jam_masuk?.slice(0, 5) || '—'} — {d.jam_pulang?.slice(0, 5) || '—'}
                    {d.jam_lembur > 0 && <span className="text-orange-400 ml-2">+{d.jam_lembur}j lembur</span>}
                  </div>
                </div>
                <span className="text-[10px] font-semibold">{cfg.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
