import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Calendar, Info, FileWarning, Image as ImageIcon, X, MapPin, MessageSquare } from 'lucide-react'
import PhotoInput from '../../components/PhotoInput'

const jenisOptions = [
  { value: 'PAID', label: 'Izin Berbayar', desc: 'Dihitung hadir, gaji tetap dibayar' },
  { value: 'UNPAID', label: 'Izin Tidak Berbayar', desc: 'Tidak dihitung hadir, gaji dipotong' },
]

const statusColor = {
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  APPROVED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  REJECTED: 'bg-red-500/15 text-red-400 border-red-500/20',
  CANCEL_REQUESTED: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  CANCELLED: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
}

const statusLabel = {
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  CANCEL_REQUESTED: 'Menunggu Batal Izin',
  CANCELLED: 'Batal Izin (Disetujui)',
}

export default function UserIzin() {
  const { karyawan } = useUserAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('izin') // 'izin' | 'laporan'
  const [view, setView] = useState('list')
  const [riwayatIzin, setRiwayatIzin] = useState([])
  const [riwayatLaporan, setRiwayatLaporan] = useState([])
  const [loading, setLoading] = useState(true)
  const [zoomPhoto, setZoomPhoto] = useState(null)

  const [jenis, setJenis] = useState('PAID')
  const [tglMulai, setTglMulai] = useState('')
  const [tglSelesai, setTglSelesai] = useState('')
  const [alasan, setAlasan] = useState('')
  const [fotoFile, setFotoFile] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Batal Izin modal state
  const [batalModal, setBatalModal] = useState(null)
  const [alasanBatal, setAlasanBatal] = useState('')
  const [submittingBatal, setSubmittingBatal] = useState(false)

  useEffect(() => { loadData() }, [activeTab])

  async function loadData() {
    setLoading(true)
    if (activeTab === 'izin') {
      const { data } = await supabase
        .from('absen_izin')
        .select('*')
        .eq('karyawan_id', karyawan.id)
        .order('created_at', { ascending: false })
        .limit(25)
      setRiwayatIzin(data || [])
    } else {
      const { data } = await supabase
        .from('absen_laporan_terlewat')
        .select('*, absen_jadwal_slot(label, jam, jenis)')
        .eq('karyawan_id', karyawan.id)
        .order('created_at', { ascending: false })
        .limit(25)
      setRiwayatLaporan(data || [])
    }
    setLoading(false)
  }

  function handleCapture(file, url) {
    setFotoFile(file)
    setFotoPreview(url)
  }

  function removePhoto() {
    setFotoFile(null)
    if (fotoPreview) URL.revokeObjectURL(fotoPreview)
    setFotoPreview(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!tglMulai || !tglSelesai) { setError('Tanggal harus diisi'); return }
    if (alasan.trim().length < 5) { setError('Alasan harus minimal 5 karakter'); return }

    setSubmitting(true)
    setError('')

    try {
      let fotoUrl = null
      if (fotoFile) {
        try {
          const filePath = `izin/${karyawan.id}/${Date.now()}.jpg`
          const { error: uploadErr } = await supabase.storage
            .from('scan-photos')
            .upload(filePath, fotoFile, { contentType: fotoFile.type, upsert: false })
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from('scan-photos').getPublicUrl(filePath)
            fotoUrl = urlData.publicUrl
          }
        } catch { /* ignore */ }

        if (!fotoUrl && fotoFile) {
          fotoUrl = await new Promise((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.readAsDataURL(fotoFile)
          })
        }
      }

      const { data, error: rpcErr } = await supabase.rpc('absen_ajukan_izin', {
        p_karyawan_id: karyawan.id,
        p_tanggal_mulai: tglMulai,
        p_tanggal_selesai: tglSelesai,
        p_jenis: jenis,
        p_alasan: alasan.trim(),
        p_foto_url: fotoUrl,
      })
      if (rpcErr) throw rpcErr
      if (data?.error) throw new Error(data.error)

      setView('list')
      setAlasan('')
      setTglMulai('')
      setTglSelesai('')
      setJenis('PAID')
      removePhoto()
      loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRequestCancel(e) {
    e.preventDefault()
    if (alasanBatal.trim().length < 5) { setError('Alasan pembatalan harus minimal 5 karakter'); return }

    setSubmittingBatal(true)
    setError('')

    try {
      const { data, error: rpcErr } = await supabase.rpc('absen_ajukan_batal_izin', {
        p_izin_id: batalModal.id,
        p_karyawan_id: karyawan.id,
        p_alasan_batal: alasanBatal.trim(),
      })
      if (rpcErr) throw rpcErr
      if (data?.error) throw new Error(data.error)

      setBatalModal(null)
      setAlasanBatal('')
      loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmittingBatal(false)
    }
  }

  const today = new Date().toISOString().split('T')[0]

  if (view === 'form') {
    return (
      <div className="px-4 py-4">
        <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm text-slate-400 mb-4 hover:text-slate-200 transition-colors">
          <ChevronLeft size={16} /> Kembali
        </button>

        <h2 className="text-base font-bold text-slate-100 mb-4">Ajukan Izin</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Jenis */}
          <div>
            <label className="text-xs text-slate-400 block mb-2">Jenis Izin</label>
            <div className="grid grid-cols-2 gap-2">
              {jenisOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setJenis(opt.value)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    jenis === opt.value
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-slate-700 bg-white/5 hover:border-slate-600'
                  }`}
                >
                  <div className={`text-sm font-semibold ${jenis === opt.value ? 'text-cyan-400' : 'text-slate-300'}`}>
                    {opt.label}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Tanggal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Tanggal Mulai</label>
              <input type="date" value={tglMulai} onChange={e => { setTglMulai(e.target.value); if (!tglSelesai) setTglSelesai(e.target.value) }} min={today} className="user-input" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Tanggal Selesai</label>
              <input type="date" value={tglSelesai} onChange={e => setTglSelesai(e.target.value)} min={tglMulai || today} className="user-input" />
            </div>
          </div>

          {/* Alasan */}
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Alasan <span className="text-red-400">*</span></label>
            <textarea
              value={alasan}
              onChange={e => setAlasan(e.target.value)}
              placeholder="Jelaskan alasan izin..."
              rows={3}
              className="user-input resize-none"
            />
          </div>

          {/* Foto */}
          <PhotoInput
            preview={fotoPreview}
            onCapture={handleCapture}
            onRemove={removePhoto}
            label="Dokumen Pendukung"
          />

          {jenis === 'PAID' && (
            <div className="flex items-start gap-2.5 text-[11px] text-slate-400 bg-amber-500/5 border border-amber-500/15 rounded-xl p-3">
              <Info size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <span>Status izin akan diverifikasi oleh admin. Apabila admin mengubah menjadi <strong className="text-amber-300">Tidak Berbayar</strong>, maka gaji akan langsung dipotong sesuai jumlah hari izin.</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3">
              <AlertTriangle size={14} className="shrink-0" /> {error}
            </div>
          )}

          <button type="submit" disabled={submitting} className="user-btn-primary w-full">
            {submitting ? 'Mengirim...' : 'Ajukan Izin'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 min-h-[85vh]">
      <button onClick={() => navigate('/user')} className="flex items-center gap-1 text-sm text-slate-400 mb-4 hover:text-slate-200 transition-colors">
        <ChevronLeft size={16} /> Beranda
      </button>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Calendar size={18} className="text-cyan-400" /> Pengajuan Izin
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Izin berbayar & tidak berbayar</p>
        </div>
        <button onClick={() => setView('form')} className="user-btn-primary text-xs py-2 px-3 flex items-center gap-1.5">
          <Calendar size={12} /> Ajukan Izin
        </button>
      </div>

      {/* Direct link banner to Laporan Terlewat */}
      <button
        onClick={() => navigate('/user/laporan-terlewat')}
        className="w-full mb-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/40 flex items-center justify-between transition-all"
      >
        <div className="flex items-center gap-2.5">
          <FileWarning size={16} className="text-amber-400 shrink-0" />
          <div className="text-left">
            <span className="text-xs font-bold text-slate-200 block">Status Laporan Terlewat</span>
            <span className="text-[10px] text-slate-400 block">Cek status laporan absen terlewat & catatan admin</span>
          </div>
        </div>
        <span className="text-xs font-bold text-amber-400 inline-flex items-center gap-1">Lihat <ChevronRight size={14} /></span>
      </button>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
        </div>
      ) : riwayatIzin.length === 0 ? (
        <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10 p-6">
          <Calendar size={36} className="mx-auto text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-slate-300">Belum Ada Pengajuan Izin</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">Anda belum pernah mengajukan izin kerja</p>
          <button onClick={() => setView('form')} className="user-btn-primary text-xs">
            Ajukan Izin Sekarang
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {riwayatIzin.map(izin => {
            const mulai = new Date(izin.tanggal_mulai + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
            const selesai = new Date(izin.tanggal_selesai + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
            const hari = Math.ceil((new Date(izin.tanggal_selesai) - new Date(izin.tanggal_mulai)) / 86400000) + 1

            return (
              <div key={izin.id} className={`border rounded-2xl p-4 ${statusColor[izin.status]}`}>
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <span className="text-sm font-semibold text-slate-100">
                      {mulai === selesai ? mulai : `${mulai} – ${selesai}`}
                    </span>
                    <span className="text-[10px] text-slate-500 ml-2">{hari} hari</span>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-current">
                    {statusLabel[izin.status]}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] mt-1">
                  <span className={`px-1.5 py-0.5 rounded ${izin.jenis === 'PAID' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
                    {izin.jenis === 'PAID' ? 'Berbayar' : 'Tidak Berbayar'}
                  </span>
                  <span className="text-slate-300 truncate">{izin.alasan}</span>
                </div>

                {izin.catatan_admin && (
                  <div className={`mt-2.5 p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                    izin.status === 'REJECTED'
                      ? 'bg-red-500/10 border-red-500/20 text-red-300'
                      : izin.status === 'APPROVED'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                  }`}>
                    <MessageSquare size={13} className="shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-[11px] block">Catatan Admin:</span>
                      <span className="text-[11px] leading-relaxed opacity-90">{izin.catatan_admin}</span>
                    </div>
                  </div>
                )}

                {izin.status === 'APPROVED' && (
                  <div className="mt-2.5 pt-2 border-t border-white/10 flex justify-end">
                    <button
                      onClick={() => { setBatalModal(izin); setAlasanBatal(''); setError('') }}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold flex items-center gap-1 hover:bg-amber-500/30 transition-colors"
                    >
                      <FileWarning size={12} /> Ajukan Batal Izin
                    </button>
                  </div>
                )}

                {izin.status === 'CANCEL_REQUESTED' && (
                  <div className="mt-2 text-[10px] text-amber-300/80 bg-amber-500/10 p-2 rounded-lg italic">
                    Alasan Pembatalan: {izin.alasan_batal || '-'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Ajukan Batal Izin */}
      {batalModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setBatalModal(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-4 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-slate-100">Ajukan Pembatalan Izin</h3>
              <button onClick={() => setBatalModal(null)} className="p-1 text-slate-400 hover:text-slate-200">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRequestCancel} className="space-y-3">
              <div className="text-xs text-slate-400">
                Anda mengajukan pembatalan izin periode <strong className="text-slate-200">{batalModal.tanggal_mulai} s/d {batalModal.tanggal_selesai}</strong>.
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Alasan Pembatalan <span className="text-red-400">*</span></label>
                <textarea
                  value={alasanBatal}
                  onChange={e => setAlasanBatal(e.target.value)}
                  placeholder="Contoh: Acara keluarga selesai lebih cepat, saya kembali masuk kerja..."
                  rows={3}
                  className="user-input text-xs resize-none"
                />
              </div>

              {error && (
                <div className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setBatalModal(null)} className="flex-1 py-2 rounded-xl border border-slate-700 text-xs text-slate-300">
                  Batal
                </button>
                <button type="submit" disabled={submittingBatal} className="user-btn-primary flex-1 text-xs">
                  {submittingBatal ? 'Mengirim...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </form>
          </div>
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

