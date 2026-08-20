import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { ChevronLeft, FileWarning, Image as ImageIcon, X, MapPin, MessageSquare } from 'lucide-react'

const statusColor = {
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  APPROVED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  REJECTED: 'bg-red-500/15 text-red-400 border-red-500/20',
}

const statusLabel = { PENDING: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak' }

export default function UserLaporanTerlewat() {
  const { karyawan, outdoorMode } = useUserAuth()
  const navigate = useNavigate()

  const [filter, setFilter] = useState('ALL') // 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
  const [riwayatLaporan, setRiwayatLaporan] = useState([])
  const [loading, setLoading] = useState(true)
  const [zoomPhoto, setZoomPhoto] = useState(null)

  useEffect(() => {
    loadLaporan()
  }, [filter])

  async function loadLaporan() {
    setLoading(true)
    let q = supabase
      .from('absen_laporan_terlewat')
      .select('*, absen_jadwal_slot(label, jam, jenis)')
      .eq('karyawan_id', karyawan.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (filter !== 'ALL') q = q.eq('status', filter)

    const { data } = await q
    setRiwayatLaporan(data || [])
    setLoading(false)
  }

  return (
    <div className={`px-4 py-4 min-h-[85vh] transition-colors ${outdoorMode ? 'bg-black text-white font-sans' : 'bg-slate-950 text-slate-100'}`}>
      {/* Header Back Link */}
      <button
        onClick={() => navigate('/user')}
        className="flex items-center gap-1 text-sm font-extrabold text-cyan-400 mb-4 hover:text-white transition-colors"
      >
        <ChevronLeft size={18} /> Beranda
      </button>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <FileWarning size={20} className="text-amber-400" /> Status Laporan Terlewat
          </h2>
          <p className="text-xs font-bold text-slate-300 mt-0.5">Daftar & status laporan absen terlewat yang diajukan</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className={`flex gap-1.5 mb-5 p-1.5 rounded-2xl border overflow-x-auto ${
        outdoorMode
          ? 'bg-slate-900 border-2 border-slate-800'
          : 'bg-slate-900/60 border border-slate-800'
      }`}>
        {[
          { key: 'ALL', label: 'Semua' },
          { key: 'PENDING', label: 'Menunggu' },
          { key: 'APPROVED', label: 'Disetujui' },
          { key: 'REJECTED', label: 'Ditolak' },
        ].map(tab => {
          const isActive = filter === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-cyan-400 text-slate-950 border border-cyan-300 shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      ) : riwayatLaporan.length === 0 ? (
        <div className={`text-center py-16 rounded-3xl border p-6 ${
          outdoorMode
            ? 'bg-black border-2 border-slate-800 text-white'
            : 'bg-slate-900/60 border border-slate-800'
        }`}>
          <FileWarning size={40} className="mx-auto text-slate-500 mb-3" />
          <h3 className="text-sm font-black text-white">Belum Ada Laporan Terlewat</h3>
          <p className="text-xs font-bold text-slate-300 mt-1 max-w-xs mx-auto">
            {filter === 'ALL'
              ? 'Anda belum pernah mengajukan laporan absen terlewat'
              : `Tidak ada laporan dengan status ${statusLabel[filter] || filter}`}
          </p>
          <button onClick={() => navigate('/user')} className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-extrabold text-xs rounded-xl border border-slate-700">
            Kembali ke Beranda
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {riwayatLaporan.map(lap => {
            const tgl = new Date(lap.tanggal + 'T00:00').toLocaleDateString('id-ID', {
              day: 'numeric', month: 'short', year: 'numeric'
            })

            return (
              <div
                key={lap.id}
                className={`rounded-3xl p-4 transition-all border ${
                  outdoorMode
                    ? lap.status === 'PENDING'
                      ? 'bg-black border-2 border-amber-400 shadow-2xl shadow-amber-950/80 text-white'
                      : lap.status === 'APPROVED'
                      ? 'bg-black border-2 border-emerald-400 shadow-2xl shadow-emerald-950/80 text-white'
                      : 'bg-black border-2 border-rose-500 shadow-2xl shadow-rose-950/80 text-white'
                    : `bg-slate-900/80 ${statusColor[lap.status]}`
                }`}
              >
                {/* Slot info & status badge */}
                <div className="flex items-start justify-between mb-3 border-b border-slate-800 pb-2">
                  <div>
                    <span className="text-xs font-black text-white">
                      {tgl} &bull; {lap.absen_jadwal_slot?.jam?.slice(0, 5)} ({lap.absen_jadwal_slot?.label})
                    </span>
                  </div>
                  <span className={`text-[11px] font-black px-3 py-0.5 rounded-full border-2 ${
                    lap.status === 'PENDING'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-400'
                      : lap.status === 'APPROVED'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500'
                  }`}>
                    {statusLabel[lap.status]}
                  </span>
                </div>

                {/* Alasan */}
                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-[11px] font-black text-cyan-300 block">Alasan Karyawan:</span>
                  <p className="text-xs font-bold text-white leading-relaxed">{lap.alasan}</p>
                </div>

                {/* Evidence & GPS */}
                <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                  {lap.foto_url ? (
                    <button
                      onClick={() => setZoomPhoto(lap.foto_url)}
                      className="flex items-center gap-1.5 text-cyan-300 hover:text-white font-extrabold"
                    >
                      <ImageIcon size={14} className="text-cyan-400" /> Lihat Foto Evidence
                    </button>
                  ) : <span className="text-slate-400 font-medium">Tidak ada foto</span>}

                  {lap.gps_lat && lap.gps_lng && (
                    <a
                      href={`https://www.google.com/maps?q=${lap.gps_lat},${lap.gps_lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-slate-300 hover:text-cyan-300 font-mono font-bold"
                    >
                      <MapPin size={13} className="text-cyan-400 shrink-0" />
                      {Number(lap.gps_lat).toFixed(4)}, {Number(lap.gps_lng).toFixed(4)} ↗
                    </a>
                  )}
                </div>

                {/* Catatan Admin Box */}
                {lap.catatan_admin && (
                  <div className={`mt-3 p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
                    lap.status === 'REJECTED'
                      ? 'bg-rose-950/80 border-2 border-rose-500 text-white'
                      : lap.status === 'APPROVED'
                      ? 'bg-emerald-950/80 border-2 border-emerald-400 text-white'
                      : 'bg-amber-950/80 border-2 border-amber-400 text-white'
                  }`}>
                    <MessageSquare size={16} className="shrink-0 mt-0.5 text-cyan-400" />
                    <div>
                      <span className="font-black text-cyan-300 text-xs block mb-0.5">Catatan Admin:</span>
                      <span className="text-xs font-bold text-white leading-relaxed">{lap.catatan_admin}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Zoom Photo Modal */}
      {zoomPhoto && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setZoomPhoto(null)}>
          <button onClick={() => setZoomPhoto(null)} className="absolute top-4 right-4 p-2 bg-slate-900 border border-slate-700 rounded-full text-white">
            <X size={22} />
          </button>
          <img src={zoomPhoto} alt="Evidence" className="max-w-full max-h-[85vh] rounded-3xl object-contain border-2 border-cyan-400 shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
