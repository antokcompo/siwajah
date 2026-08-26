import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { FileWarning, CalendarDays, CheckCircle, XCircle, X, Image as ImageIcon, Edit3, Eye, MapPin, ExternalLink } from 'lucide-react'
import { getActiveProject } from './PilihProyek'

const tabConfig = [
  { key: 'laporan', label: 'Laporan Terlewat', icon: FileWarning },
  { key: 'izin', label: 'Izin Pekerja', icon: CalendarDays },
]

const statusBadge = {
  PENDING: 'bg-amber-500/15 text-amber-400',
  APPROVED: 'bg-emerald-500/15 text-emerald-400',
  REJECTED: 'bg-red-500/15 text-red-400',
  CANCEL_REQUESTED: 'bg-purple-500/15 text-purple-400',
  CANCELLED: 'bg-gray-500/15 text-gray-400',
}

const statusLabel = {
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  CANCEL_REQUESTED: 'Pengajuan Batal Izin',
  CANCELLED: 'Batal Izin',
}

export default function LaporanIzin() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('laporan')
  const [filter, setFilter] = useState('PENDING')
  const [laporan, setLaporan] = useState([])
  const [izin, setIzin] = useState([])
  const [loading, setLoading] = useState(true)
  const [laporanDetail, setLaporanDetail] = useState(null)
  const [izinModal, setIzinModal] = useState(null)
  const [catatan, setCatatan] = useState('')
  const [processing, setProcessing] = useState(false)
  const [zoomPhoto, setZoomPhoto] = useState(null)

  useEffect(() => {
    load()
    const handleStorage = () => load()
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [tab, filter])

  async function load() {
    setLoading(true)
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    const { data: karyawanProyek } = await supabase.from('absen_karyawan').select('id').eq('kode_proyek', activeKode)
    const kIds = (karyawanProyek || []).map(k => k.id)

    if (kIds.length === 0) {
      if (tab === 'laporan') setLaporan([])
      else setIzin([])
      setLoading(false)
      return
    }

    if (tab === 'laporan') {
      let q = supabase
        .from('absen_laporan_terlewat')
        .select('*, absen_karyawan(nama, jabatan, atasan_id), absen_jadwal_slot(label, jam, jenis)')
        .in('karyawan_id', kIds)
        .order('created_at', { ascending: false })
        .limit(50)
      if (filter !== 'ALL') q = q.eq('status', filter)
      const { data } = await q
      setLaporan(data || [])
    } else {
      let q = supabase
        .from('absen_izin')
        .select('*, absen_karyawan(nama, jabatan, atasan_id)')
        .in('karyawan_id', kIds)
        .order('created_at', { ascending: false })
        .limit(50)
      if (filter === 'PENDING') {
        q = q.or('status.eq.PENDING,status.eq.CANCEL_REQUESTED')
      } else if (filter !== 'ALL') {
        q = q.eq('status', filter)
      }
      const { data, error } = await q
      if (error) console.error('Error fetching izin:', error)
      setIzin(data || [])
    }
    setLoading(false)
  }

  async function handleLaporanAction(id, status) {
    setProcessing(true)
    try {
      const { data, error } = await supabase.rpc('absen_proses_laporan', {
        p_laporan_id: id, p_status: status, p_catatan: catatan || null, p_user_id: profile?.id || null,
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setLaporanDetail(null)
      setCatatan('')
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setProcessing(false)
    }
  }

  async function handleIzinAction(id, status, jenis) {
    setProcessing(true)
    try {
      const { data, error } = await supabase.rpc('absen_proses_izin', {
        p_izin_id: id, p_status: status, p_catatan: catatan || null, p_user_id: profile?.id || null, p_jenis: jenis || null,
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setIzinModal(null)
      setCatatan('')
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setProcessing(false)
    }
  }

  async function handleBatalAction(id, action) {
    setProcessing(true)
    try {
      const { data, error } = await supabase.rpc('absen_proses_batal_izin', {
        p_izin_id: id,
        p_action: action,
        p_catatan: catatan || null,
        p_user_id: profile?.id || null,
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setIzinModal(null)
      setCatatan('')
      load()
    } catch (err) {
      alert(err.message)
    } finally {
      setProcessing(false)
    }
  }

  const filterOptions = tab === 'izin'
    ? ['PENDING', 'CANCEL_REQUESTED', 'APPROVED', 'REJECTED', 'ALL']
    : ['PENDING', 'APPROVED', 'REJECTED', 'ALL']

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Laporan & Izin</h1>
          <p className="text-gray-500 text-xs mt-0.5">Review laporan absen terlewat dan pengajuan izin</p>
        </div>
      </div>

      <div className="main-content">
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {tabConfig.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setFilter('PENDING') }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                tab === t.key
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
              }`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {filterOptions.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                filter === f ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {f === 'ALL' ? 'Semua' : statusLabel[f]}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
          </div>
        ) : tab === 'laporan' ? (
          <div className="card">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    <th className="text-left px-5 py-3">Karyawan</th>
                    <th className="text-center px-4 py-3">Tanggal</th>
                    <th className="text-center px-4 py-3">Slot</th>
                    <th className="text-left px-4 py-3">Alasan</th>
                    <th className="text-center px-4 py-3">Evidence</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-center px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {laporan.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">Tidak ada data</td></tr>
                  ) : laporan.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-900">{l.absen_karyawan?.nama}</div>
                        <div className="text-[10px] text-gray-400">{l.absen_karyawan?.jabatan}</div>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-600">
                        {new Date(l.tanggal + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-gray-600">{l.absen_jadwal_slot?.jam?.slice(0, 5)}</span>
                        <span className="text-gray-400 text-[10px] ml-1">{l.absen_jadwal_slot?.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                        <p className="truncate" title={l.alasan}>{l.alasan}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {l.foto_url ? (
                          <button onClick={() => setZoomPhoto(l.foto_url)} className="text-blue-500 hover:text-blue-400 transition-colors">
                            <ImageIcon size={16} />
                          </button>
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`badge ${statusBadge[l.status]}`}>{statusLabel[l.status]}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {l.status === 'PENDING' ? (
                          <button
                            onClick={() => { setLaporanDetail(l); setCatatan('') }}
                            className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition-colors"
                            title="Lihat Detail & Proses"
                          >
                            <Eye size={16} />
                          </button>
                        ) : (
                          <span className="text-[10px] text-gray-400">{l.catatan_admin || '-'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Izin Pekerja */
          <div className="card">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    <th className="text-left px-5 py-3">Karyawan</th>
                    <th className="text-center px-4 py-3">Tanggal</th>
                    <th className="text-center px-4 py-3">Hari</th>
                    <th className="text-center px-4 py-3">Jenis</th>
                    <th className="text-left px-4 py-3">Alasan</th>
                    <th className="text-center px-4 py-3">Dok</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-center px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {izin.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-400">Tidak ada data</td></tr>
                  ) : izin.map(i => {
                    const hari = Math.ceil((new Date(i.tanggal_selesai) - new Date(i.tanggal_mulai)) / 86400000) + 1
                    const mulai = new Date(i.tanggal_mulai + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                    const selesai = new Date(i.tanggal_selesai + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
                    return (
                      <tr key={i.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-medium text-gray-900">{i.absen_karyawan?.nama}</div>
                          <div className="text-[10px] text-gray-400">{i.absen_karyawan?.jabatan}</div>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600 text-xs">
                          {mulai === selesai ? mulai : `${mulai} – ${selesai}`}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600">{hari}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`badge ${i.jenis === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                            {i.jenis === 'PAID' ? 'Berbayar' : 'Tidak Berbayar'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                          <p className="truncate" title={i.alasan}>{i.alasan}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {i.foto_url ? (
                            <button onClick={() => setZoomPhoto(i.foto_url)} className="text-blue-500 hover:text-blue-400 transition-colors">
                              <ImageIcon size={16} />
                            </button>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`badge ${statusBadge[i.status]}`}>{statusLabel[i.status]}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {i.status === 'PENDING' || i.status === 'CANCEL_REQUESTED' ? (
                            <button
                              onClick={() => { setIzinModal(i); setCatatan('') }}
                              className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition-colors"
                              title="Proses Izin / Batal Izin"
                            >
                              <Edit3 size={16} />
                            </button>
                          ) : (
                            <div>
                              <span className="text-[10px] text-gray-400">{i.catatan_admin || '-'}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Laporan detail + action modal */}
      {laporanDetail && (
        <div className="modal-overlay" onClick={() => { setLaporanDetail(null); setCatatan('') }}>
          <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <span className="font-semibold text-gray-900">Detail Laporan Terlewat</span>
              <button onClick={() => { setLaporanDetail(null); setCatatan('') }} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Employee info & GPS */}
              <div className="bg-white/5 rounded-xl p-3 space-y-1">
                <div className="text-sm font-medium text-gray-900">{laporanDetail.absen_karyawan?.nama}</div>
                <div className="text-xs text-gray-500">{laporanDetail.absen_karyawan?.jabatan}</div>
                <div className="text-xs text-gray-600">
                  {new Date(laporanDetail.tanggal + 'T00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {' • '}{laporanDetail.absen_jadwal_slot?.jam?.slice(0, 5)} — {laporanDetail.absen_jadwal_slot?.label}
                </div>
                {laporanDetail.gps_lat && laporanDetail.gps_lng ? (
                  <div className="pt-1 flex items-center gap-1.5 text-xs text-cyan-400">
                    <MapPin size={14} className="shrink-0" />
                    <a
                      href={`https://www.google.com/maps?q=${laporanDetail.gps_lat},${laporanDetail.gps_lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline font-mono inline-flex items-center gap-1"
                    >
                      <span>GPS: {Number(laporanDetail.gps_lat).toFixed(6)}, {Number(laporanDetail.gps_lng).toFixed(6)}</span>
                      <ExternalLink size={12} className="shrink-0" />
                    </a>
                  </div>
                ) : (
                  <div className="pt-1 text-xs text-gray-400 italic">GPS: Tidak ada lokasi</div>
                )}
              </div>

              {/* Alasan */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Alasan</label>
                <p className="text-sm text-gray-800 bg-white/5 rounded-xl p-3">{laporanDetail.alasan}</p>
              </div>

              {/* Evidence photo */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">Foto Evidence</label>
                {laporanDetail.foto_url ? (
                  <img
                    src={laporanDetail.foto_url}
                    alt="Evidence"
                    className="w-full max-h-64 rounded-xl object-contain bg-black/20 cursor-pointer"
                    onClick={() => setZoomPhoto(laporanDetail.foto_url)}
                  />
                ) : (
                  <p className="text-xs text-gray-400 bg-white/5 rounded-xl p-3 text-center">Tidak ada foto</p>
                )}
              </div>

              {/* Catatan */}
              <div>
                <label className="text-xs text-gray-500 block mb-1.5">Catatan Admin (opsional)</label>
                <textarea value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Tulis catatan..." rows={2} className="input-field resize-none" />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleLaporanAction(laporanDetail.id, 'REJECTED')}
                  disabled={processing}
                  className="btn-danger flex-1"
                >
                  {processing ? '...' : 'Tolak'}
                </button>
                <button
                  onClick={() => handleLaporanAction(laporanDetail.id, 'APPROVED')}
                  disabled={processing}
                  className="btn-success flex-1"
                >
                  {processing ? 'Memproses...' : 'Setujui'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Izin process modal */}
      {izinModal && <IzinProcessModal
        izin={izinModal}
        catatan={catatan}
        setCatatan={setCatatan}
        processing={processing}
        onApprove={(jenis) => handleIzinAction(izinModal.id, 'APPROVED', jenis)}
        onReject={() => handleIzinAction(izinModal.id, 'REJECTED', null)}
        onApproveCancel={() => handleBatalAction(izinModal.id, 'APPROVE_CANCEL')}
        onRejectCancel={() => handleBatalAction(izinModal.id, 'REJECT_CANCEL')}
        onClose={() => { setIzinModal(null); setCatatan('') }}
      />}

      {/* Photo zoom */}
      {zoomPhoto && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 cursor-pointer" onClick={() => setZoomPhoto(null)}>
          <button onClick={() => setZoomPhoto(null)} className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors">
            <X size={20} className="text-white" />
          </button>
          <img src={zoomPhoto} alt="Evidence" className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

function IzinProcessModal({ izin, catatan, setCatatan, processing, onApprove, onReject, onApproveCancel, onRejectCancel, onClose }) {
  const isCancelReq = izin.status === 'CANCEL_REQUESTED'
  const [jenisOverride, setJenisOverride] = useState(izin.jenis)
  const changed = jenisOverride !== izin.jenis

  const hari = Math.ceil((new Date(izin.tanggal_selesai) - new Date(izin.tanggal_mulai)) / 86400000) + 1
  const mulai = new Date(izin.tanggal_mulai + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  const selesai = new Date(izin.tanggal_selesai + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <span className="font-semibold text-gray-900">
            {isCancelReq ? 'Proses Pembatalan Izin' : 'Proses Izin'}
          </span>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Info */}
          <div className="bg-white/5 rounded-xl p-3 space-y-1">
            <div className="text-sm font-medium text-gray-900">{izin.absen_karyawan?.nama}</div>
            <div className="text-xs text-gray-500">{izin.absen_karyawan?.jabatan}</div>
            <div className="text-xs text-gray-600 mt-1">
              {mulai === selesai ? mulai : `${mulai} – ${selesai}`} ({hari} hari)
            </div>
            <div className="text-xs text-gray-600 mt-1">Alasan Izin Awal: {izin.alasan}</div>
            {isCancelReq && (
              <div className="text-xs font-semibold text-purple-400 bg-purple-500/10 p-2 rounded-lg mt-2">
                Alasan Pengajuan Batal Izin: {izin.alasan_batal || '-'}
              </div>
            )}
          </div>

          {!isCancelReq && (
            <div>
              <label className="text-xs text-gray-500 block mb-2">Jenis Izin</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setJenisOverride('PAID')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    jenisOverride === 'PAID'
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-gray-200 bg-white/5 hover:border-gray-300'
                  }`}
                >
                  <div className={`text-sm font-semibold ${jenisOverride === 'PAID' ? 'text-emerald-500' : 'text-gray-500'}`}>
                    Berbayar
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Dihitung hadir</div>
                </button>
                <button
                  type="button"
                  onClick={() => setJenisOverride('UNPAID')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    jenisOverride === 'UNPAID'
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-gray-200 bg-white/5 hover:border-gray-300'
                  }`}
                >
                  <div className={`text-sm font-semibold ${jenisOverride === 'UNPAID' ? 'text-amber-500' : 'text-gray-500'}`}>
                    Tidak Berbayar
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Gaji dipotong</div>
                </button>
              </div>
              {changed && (
                <p className="text-[11px] text-amber-400 mt-2">
                  Jenis izin diubah dari {izin.jenis === 'PAID' ? 'Berbayar' : 'Tidak Berbayar'} → {jenisOverride === 'PAID' ? 'Berbayar' : 'Tidak Berbayar'}
                </p>
              )}
            </div>
          )}

          {/* Catatan */}
          <div>
            <label className="text-xs text-gray-500 block mb-1.5">Catatan Admin (opsional)</label>
            <textarea value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Tulis catatan untuk karyawan..." rows={2} className="input-field resize-none" />
          </div>

          {/* Actions */}
          {isCancelReq ? (
            <div className="flex gap-2">
              <button onClick={onRejectCancel} disabled={processing} className="btn-danger flex-1">
                {processing ? '...' : 'Tolak Batal Izin'}
              </button>
              <button onClick={onApproveCancel} disabled={processing} className="btn-success flex-1">
                {processing ? 'Memproses...' : 'Setujui Batal Izin'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={onReject} disabled={processing} className="btn-danger flex-1">
                {processing ? '...' : 'Tolak'}
              </button>
              <button onClick={() => onApprove(jenisOverride)} disabled={processing} className="btn-success flex-1">
                {processing ? 'Memproses...' : changed ? 'Ubah & Setujui' : 'Setujui'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
