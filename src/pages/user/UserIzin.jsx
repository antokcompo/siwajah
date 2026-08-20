import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Calendar, Info, FileWarning, Image as ImageIcon, X, MapPin, MessageSquare, Send } from 'lucide-react'
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
  const { karyawan, outdoorMode } = useUserAuth()
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

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [izinRes, lapRes] = await Promise.all([
      supabase.from('absen_izin').select('*').eq('karyawan_id', karyawan.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('absen_laporan_terlewat').select('*, absen_jadwal_slot(label, jam)').eq('karyawan_id', karyawan.id).order('created_at', { ascending: false }).limit(30),
    ])
    setRiwayatIzin(izinRes.data || [])
    setRiwayatLaporan(lapRes.data || [])
    setLoading(false)
  }

  function handleCapture(file, previewUrl) {
    setFotoFile(file)
    setFotoPreview(previewUrl)
  }

  function removePhoto() {
    setFotoFile(null)
    setFotoPreview(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!tglMulai || !tglSelesai) {
      setError('Tanggal mulai dan selesai harus diisi')
      return
    }
    if (!alasan.trim()) {
      setError('Alasan izin harus diisi')
      return
    }
    if (tglSelesai < tglMulai) {
      setError('Tanggal selesai tidak boleh sebelum tanggal mulai')
      return
    }

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
        } catch { /* ignore storage error, fallback base64 */ }

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
        p_jenis: jenis,
        p_tanggal_mulai: tglMulai,
        p_tanggal_selesai: tglSelesai,
        p_alasan: alasan.trim(),
        p_foto_url: fotoUrl,
      })

      if (rpcErr) throw rpcErr
      if (data?.error) throw new Error(data.error)

      setView('list')
      setJenis('PAID')
      setTglMulai('')
      setTglSelesai('')
      setAlasan('')
      setFotoFile(null)
      setFotoPreview(null)
      loadData()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRequestCancel(e) {
    e.preventDefault()
    if (!alasanBatal.trim()) {
      setError('Alasan pembatalan harus diisi')
      return
    }
    setSubmittingBatal(true)
    setError('')

    try {
      const { data, error: rpcErr } = await supabase.rpc('absen_request_batal_izin', {
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

  if (view === 'form') {
    return (
      <div className={`px-4 py-4 min-h-[85vh] transition-colors ${outdoorMode ? 'bg-black text-white font-sans' : 'bg-slate-950 text-slate-100'}`}>
        <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm font-extrabold text-cyan-400 mb-4 hover:text-white transition-colors">
          <ChevronLeft size={18} /> Kembali
        </button>

        <div className={`rounded-3xl p-5 border transition-all ${
          outdoorMode
            ? 'bg-black border-2 border-cyan-400 shadow-2xl text-white'
            : 'bg-slate-900 border border-slate-800'
        }`}>
          <h2 className="text-lg font-black text-white mb-4 flex items-center gap-2">
            <Calendar className="text-cyan-400" size={20} /> Form Ajukan Izin
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Jenis Izin */}
            <div>
              <label className="text-xs font-black text-white block mb-2">Jenis Izin Presensi</label>
              <div className="grid grid-cols-2 gap-3">
                {jenisOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setJenis(opt.value)}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      jenis === opt.value
                        ? 'border-2 border-cyan-400 bg-cyan-500/10 shadow-lg'
                        : 'border border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className={`text-xs font-black ${jenis === opt.value ? 'text-cyan-300' : 'text-white'}`}>
                      {opt.label}
                    </div>
                    <div className="text-[11px] font-bold text-slate-300 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Tanggal */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-black text-white block mb-1.5">Tanggal Mulai</label>
                <input
                  type="date"
                  value={tglMulai}
                  onChange={e => { setTglMulai(e.target.value); if (!tglSelesai) setTglSelesai(e.target.value) }}
                  min={today}
                  className="w-full p-3.5 bg-slate-950 border-2 border-slate-700 rounded-2xl text-xs text-white font-bold focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="text-xs font-black text-white block mb-1.5">Tanggal Selesai</label>
                <input
                  type="date"
                  value={tglSelesai}
                  onChange={e => setTglSelesai(e.target.value)}
                  min={tglMulai || today}
                  className="w-full p-3.5 bg-slate-950 border-2 border-slate-700 rounded-2xl text-xs text-white font-bold focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            {/* Alasan */}
            <div>
              <label className="text-xs font-black text-white block mb-1.5">Alasan Izin <span className="text-rose-400">*</span></label>
              <textarea
                value={alasan}
                onChange={e => setAlasan(e.target.value)}
                placeholder="Jelaskan alasan izin secara rinci..."
                rows={3}
                className="w-full p-3.5 bg-slate-950 border-2 border-slate-700 rounded-2xl text-xs text-white font-bold focus:outline-none focus:border-cyan-400 resize-none font-sans"
              />
            </div>

            {/* Foto */}
            <PhotoInput
              preview={fotoPreview}
              onCapture={handleCapture}
              onRemove={removePhoto}
              label="Dokumen Pendukung / Surat Izin"
            />

            {jenis === 'PAID' && (
              <div className="flex items-start gap-2.5 text-xs font-extrabold text-amber-200 bg-amber-950/80 border-2 border-amber-400 rounded-2xl p-3.5 shadow-md">
                <Info size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <span>Status izin akan diverifikasi oleh admin. Apabila admin mengubah menjadi <strong className="text-amber-300">Tidak Berbayar</strong>, maka gaji akan dipotong sesuai jumlah hari izin.</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs font-black text-rose-300 bg-rose-950/80 border-2 border-rose-500 rounded-2xl p-3.5">
                <AlertTriangle size={16} className="shrink-0 text-rose-400" /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-base rounded-2xl shadow-xl shadow-cyan-400/50 border border-cyan-300 transition-all uppercase tracking-wide"
            >
              {submitting ? 'Mengirim...' : 'Ajukan Izin Sekarang'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className={`px-4 py-4 min-h-[85vh] transition-colors ${outdoorMode ? 'bg-black text-white font-sans' : 'bg-slate-950 text-slate-100'}`}>
      <button onClick={() => navigate('/user')} className="flex items-center gap-1 text-sm font-extrabold text-cyan-400 mb-4 hover:text-white transition-colors">
        <ChevronLeft size={18} /> Beranda
      </button>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Calendar size={20} className="text-cyan-400" /> Pengajuan Izin
          </h2>
          <p className="text-xs font-bold text-slate-300 mt-0.5">Izin berbayar & tidak berbayar</p>
        </div>
        <button onClick={() => setView('form')} className="px-3.5 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md">
          <Calendar size={14} /> Ajukan Izin
        </button>
      </div>

      {/* Direct link banner to Laporan Terlewat */}
      <button
        onClick={() => navigate('/user/laporan-terlewat')}
        className={`w-full p-3.5 rounded-2xl border flex items-center justify-between mb-4 transition-all text-left ${
          outdoorMode
            ? 'bg-black border-2 border-amber-400 shadow-xl text-white'
            : 'bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
        }`}
      >
        <div className="flex items-center gap-3">
          <FileWarning size={20} className="text-amber-400 shrink-0" />
          <div>
            <div className="text-xs font-black text-white">Lupa Presensi Masuk / Pulang?</div>
            <div className="text-[11px] font-bold text-slate-300">Gunakan fitur Lapor Absen Terlewat di sini</div>
          </div>
        </div>
        <ChevronRight size={18} className="text-amber-400 shrink-0" />
      </button>

      {/* Segmented Tabs */}
      <div className={`flex gap-1.5 mb-4 p-1.5 rounded-2xl border ${outdoorMode ? 'bg-slate-900 border-2 border-slate-800' : 'bg-slate-900/60 border border-slate-800'}`}>
        <button
          onClick={() => setActiveTab('izin')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all ${
            activeTab === 'izin'
              ? 'bg-cyan-400 text-slate-950 border border-cyan-300 shadow-md'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Riwayat Izin ({riwayatIzin.length})
        </button>
        <button
          onClick={() => setActiveTab('laporan')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold transition-all ${
            activeTab === 'laporan'
              ? 'bg-cyan-400 text-slate-950 border border-cyan-300 shadow-md'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Laporan Terlewat ({riwayatLaporan.length})
        </button>
      </div>

      {/* List Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
        </div>
      ) : activeTab === 'izin' ? (
        riwayatIzin.length === 0 ? (
          <div className={`text-center py-16 rounded-3xl border p-6 ${outdoorMode ? 'bg-black border-2 border-slate-800 text-white' : 'bg-slate-900/60 border border-slate-800'}`}>
            <Calendar size={40} className="mx-auto text-slate-500 mb-3" />
            <h3 className="text-sm font-black text-white">Belum Ada Pengajuan Izin</h3>
            <p className="text-xs font-bold text-slate-300 mt-1 max-w-xs mx-auto">
              Anda belum pernah membuat pengajuan izin
            </p>
            <button onClick={() => setView('form')} className="mt-4 px-4 py-2 bg-cyan-400 text-slate-950 font-black text-xs rounded-xl shadow-md">
              Ajukan Izin Sekarang
            </button>
          </div>
        ) : (
          <div className="space-y-3.5">
            {riwayatIzin.map(iz => (
              <div
                key={iz.id}
                className={`rounded-3xl p-4 transition-all border ${
                  outdoorMode
                    ? iz.status === 'PENDING'
                      ? 'bg-black border-2 border-amber-400 shadow-2xl shadow-amber-950/80 text-white'
                      : iz.status === 'APPROVED'
                      ? 'bg-black border-2 border-emerald-400 shadow-2xl shadow-emerald-950/80 text-white'
                      : 'bg-black border-2 border-rose-500 shadow-2xl shadow-rose-950/80 text-white'
                    : `bg-slate-900/80 ${statusColor[iz.status]}`
                }`}
              >
                <div className="flex items-start justify-between mb-3 border-b border-slate-800 pb-2">
                  <div>
                    <span className="text-xs font-black text-white">
                      {iz.tanggal_mulai === iz.tanggal_selesai
                        ? iz.tanggal_mulai
                        : `${iz.tanggal_mulai} s/d ${iz.tanggal_selesai}`}
                    </span>
                    <span className="text-[11px] font-bold text-cyan-300 block mt-0.5">
                      {iz.jenis === 'PAID' ? 'Izin Berbayar' : 'Izin Tidak Berbayar'}
                    </span>
                  </div>
                  <span className={`text-[11px] font-black px-3 py-0.5 rounded-full border-2 ${
                    iz.status === 'PENDING'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-400'
                      : iz.status === 'APPROVED'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500'
                  }`}>
                    {statusLabel[iz.status]}
                  </span>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-[11px] font-black text-cyan-300 block">Alasan Izin:</span>
                  <p className="text-xs font-bold text-white leading-relaxed">{iz.alasan}</p>
                </div>

                {iz.foto_url && (
                  <button
                    onClick={() => setZoomPhoto(iz.foto_url)}
                    className="mt-3 flex items-center gap-1.5 text-cyan-300 hover:text-white font-extrabold text-xs"
                  >
                    <ImageIcon size={14} className="text-cyan-400" /> Lihat Dokumen Pendukung
                  </button>
                )}

                {iz.status === 'APPROVED' && (
                  <div className="mt-3 pt-2 border-t border-slate-800 flex justify-end">
                    <button
                      onClick={() => setBatalModal(iz)}
                      className="px-3 py-1.5 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-400 font-extrabold text-xs hover:bg-purple-500/30 transition-all"
                    >
                      Ajukan Batal Izin
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        /* Tab Laporan Terlewat */
        riwayatLaporan.length === 0 ? (
          <div className={`text-center py-16 rounded-3xl border p-6 ${outdoorMode ? 'bg-black border-2 border-slate-800 text-white' : 'bg-slate-900/60 border border-slate-800'}`}>
            <FileWarning size={40} className="mx-auto text-slate-500 mb-3" />
            <h3 className="text-sm font-black text-white">Belum Ada Laporan Terlewat</h3>
            <p className="text-xs font-bold text-slate-300 mt-1 max-w-xs mx-auto">
              Anda belum pernah membuat laporan absen terlewat
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {riwayatLaporan.map(lap => (
              <div
                key={lap.id}
                className={`rounded-3xl p-4 transition-all border ${
                  outdoorMode
                    ? lap.status === 'PENDING'
                      ? 'bg-black border-2 border-amber-400 shadow-2xl text-white'
                      : lap.status === 'APPROVED'
                      ? 'bg-black border-2 border-emerald-400 shadow-2xl text-white'
                      : 'bg-black border-2 border-rose-500 shadow-2xl text-white'
                    : `bg-slate-900/80 ${statusColor[lap.status]}`
                }`}
              >
                <div className="flex items-start justify-between mb-3 border-b border-slate-800 pb-2">
                  <div>
                    <span className="text-xs font-black text-white">
                      {lap.tanggal} &bull; {lap.absen_jadwal_slot?.jam?.slice(0, 5)} ({lap.absen_jadwal_slot?.label})
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

                <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-1">
                  <span className="text-[11px] font-black text-cyan-300 block">Alasan Terlewat:</span>
                  <p className="text-xs font-bold text-white leading-relaxed">{lap.alasan}</p>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Batal Izin Modal */}
      {batalModal && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md ${outdoorMode ? 'bg-black/90' : 'bg-slate-950/80'}`}>
          <div className={`rounded-3xl p-5 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95 ${
            outdoorMode
              ? 'bg-black border-2 border-cyan-400 text-white shadow-cyan-950/80'
              : 'bg-slate-900 border border-slate-800'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-black text-white">Ajukan Pembatalan Izin</h3>
              <button onClick={() => setBatalModal(null)} className="p-1.5 text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRequestCancel} className="space-y-3 font-sans">
              <div className="text-xs font-bold text-slate-300 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                Pembatalan izin periode: <strong className="text-cyan-300">{batalModal.tanggal_mulai} s/d {batalModal.tanggal_selesai}</strong>
              </div>

              <div>
                <label className="text-xs font-black text-white block mb-1.5">Alasan Pembatalan <span className="text-rose-400">*</span></label>
                <textarea
                  value={alasanBatal}
                  onChange={e => setAlasanBatal(e.target.value)}
                  placeholder="Contoh: Acara keluarga selesai lebih cepat, saya kembali masuk kerja..."
                  rows={3}
                  className="w-full p-3.5 bg-slate-950 border-2 border-slate-700 rounded-2xl text-xs text-white font-bold focus:outline-none focus:border-cyan-400 resize-none font-sans"
                />
              </div>

              {error && (
                <div className="text-xs font-black text-rose-300 bg-rose-950/80 p-3 rounded-2xl border border-rose-500">
                  {error}
                </div>
              )}

              <div className="flex gap-2.5 pt-2">
                <button type="button" onClick={() => setBatalModal(null)} className="flex-1 py-3 rounded-2xl border border-slate-700 bg-slate-800 text-xs font-bold text-slate-300">
                  Batal
                </button>
                <button type="submit" disabled={submittingBatal} className="flex-1 py-3 rounded-2xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-black shadow-lg">
                  {submittingBatal ? 'Mengirim...' : 'Kirim Pengajuan'}
                </button>
              </div>
            </form>
          </div>
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
