import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { ChevronLeft, FileWarning, Image, X, MapPin, MessageSquare } from 'lucide-react'

const statusColor = {
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  APPROVED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  REJECTED: 'bg-red-500/15 text-red-400 border-red-500/20',
}

const statusLabel = { PENDING: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak' }

export default function UserLaporanTerlewat() {
  const { karyawan } = useUserAuth()
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
    <div className="px-4 py-4 min-h-[85vh]">
      {/* Header */}
      <button onClick={() => navigate('/user')} className="flex items-center gap-1 text-sm text-slate-400 mb-4 hover:text-slate-200 transition-colors">
        <ChevronLeft size={16} /> Beranda
      </button>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <FileWarning size={18} className="text-amber-400" /> Status Laporan Terlewat
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Daftar & status laporan absen terlewat yang diajukan</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1.5 mb-4 bg-white/5 p-1 rounded-xl border border-white/10 overflow-x-auto">
        {[
          { key: 'ALL', label: 'Semua' },
          { key: 'PENDING', label: 'Menunggu' },
          { key: 'APPROVED', label: 'Disetujui' },
          { key: 'REJECTED', label: 'Ditolak' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              filter === tab.key
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
        </div>
      ) : riwayatLaporan.length === 0 ? (
        <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10 p-6">
          <FileWarning size={40} className="mx-auto text-slate-600 mb-3" />
          <h3 className="text-sm font-semibold text-slate-300">Belum Ada Laporan Terlewat</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            {filter === 'ALL'
              ? 'Anda belum pernah mengajukan laporan absen terlewat'
              : `Tidak ada laporan dengan status ${statusLabel[filter] || filter}`}
          </p>
          <button onClick={() => navigate('/user')} className="mt-4 user-btn-secondary text-xs">
            Kembali ke Beranda
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {riwayatLaporan.map(lap => {
            const tgl = new Date(lap.tanggal + 'T00:00').toLocaleDateString('id-ID', {
              day: 'numeric', month: 'short', year: 'numeric'
            })

            return (
              <div key={lap.id} className={`border rounded-2xl p-4 transition-all ${statusColor[lap.status]}`}>
                {/* Slot info & status badge */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="text-xs font-bold text-slate-100">
                      {tgl} &bull; {lap.absen_jadwal_slot?.jam?.slice(0, 5)} ({lap.absen_jadwal_slot?.label})
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-current">
                    {statusLabel[lap.status]}
                  </span>
                </div>

                {/* Alasan */}
                <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Alasan Karyawan:</span>
                  <p className="text-xs text-slate-200 leading-relaxed">{lap.alasan}</p>
                </div>

                {/* Evidence & GPS */}
                <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px]">
                  {lap.foto_url ? (
                    <button
                      onClick={() => setZoomPhoto(lap.foto_url)}
                      className="flex items-center gap-1 text-cyan-400 hover:underline font-medium"
                    >
                      <Image size={13} /> Lihat Foto Evidence
                    </button>
                  ) : <span className="text-slate-500">Tidak ada foto</span>}

                  {lap.gps_lat && lap.gps_lng && (
                    <a
                      href={`https://www.google.com/maps?q=${lap.gps_lat},${lap.gps_lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-slate-400 hover:text-cyan-400 font-mono"
                    >
                      <MapPin size={12} className="text-cyan-400 shrink-0" />
                      {Number(lap.gps_lat).toFixed(4)}, {Number(lap.gps_lng).toFixed(4)} ↗
                    </a>
                  )}
                </div>

                {/* Catatan Admin Box */}
                {lap.catatan_admin && (
                  <div className={`mt-3 p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                    lap.status === 'REJECTED'
                      ? 'bg-red-500/10 border-red-500/20 text-red-300'
                      : lap.status === 'APPROVED'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                  }`}>
                    <MessageSquare size={14} className="shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-[11px] block mb-0.5">Catatan Admin:</span>
                      <span className="text-[11px] leading-relaxed">{lap.catatan_admin}</span>
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
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setZoomPhoto(null)}>
          <button onClick={() => setZoomPhoto(null)} className="absolute top-4 right-4 p-2 bg-black/50 rounded-full">
            <X size={20} className="text-white" />
          </button>
          <img src={zoomPhoto} alt="Evidence" className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}
