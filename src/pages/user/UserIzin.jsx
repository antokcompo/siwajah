import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { AlertTriangle, CheckCircle, ChevronLeft, Calendar, Info } from 'lucide-react'
import PhotoInput from '../../components/PhotoInput'

const jenisOptions = [
  { value: 'PAID', label: 'Izin Berbayar', desc: 'Dihitung hadir, gaji tetap dibayar' },
  { value: 'UNPAID', label: 'Izin Tidak Berbayar', desc: 'Tidak dihitung hadir, gaji dipotong' },
]

const statusColor = {
  PENDING: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  APPROVED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  REJECTED: 'bg-red-500/15 text-red-400 border-red-500/20',
}

const statusLabel = { PENDING: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak' }

export default function UserIzin() {
  const { karyawan } = useUserAuth()
  const navigate = useNavigate()

  const [view, setView] = useState('list')
  const [riwayat, setRiwayat] = useState([])
  const [loading, setLoading] = useState(true)

  const [jenis, setJenis] = useState('PAID')
  const [tglMulai, setTglMulai] = useState('')
  const [tglSelesai, setTglSelesai] = useState('')
  const [alasan, setAlasan] = useState('')
  const [fotoFile, setFotoFile] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadRiwayat() }, [])

  async function loadRiwayat() {
    setLoading(true)
    const { data } = await supabase
      .from('absen_izin')
      .select('*')
      .eq('karyawan_id', karyawan.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setRiwayat(data || [])
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
        const filePath = `izin/${karyawan.id}/${Date.now()}.jpg`
        const { error: uploadErr } = await supabase.storage
          .from('scan-photos')
          .upload(filePath, fotoFile, { contentType: fotoFile.type, upsert: false })
        if (uploadErr) throw new Error('Gagal upload foto: ' + uploadErr.message)
        const { data: urlData } = supabase.storage.from('scan-photos').getPublicUrl(filePath)
        fotoUrl = urlData.publicUrl
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
      loadRiwayat()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
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
    <div className="px-4 py-4">
      <button onClick={() => navigate('/user')} className="flex items-center gap-1 text-sm text-slate-400 mb-4 hover:text-slate-200 transition-colors">
        <ChevronLeft size={16} /> Beranda
      </button>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-slate-100">Izin Saya</h2>
        <button onClick={() => setView('form')} className="user-btn-primary text-xs py-2 px-3 flex items-center gap-1.5">
          <Calendar size={12} /> Ajukan Izin
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
        </div>
      ) : riwayat.length === 0 ? (
        <div className="text-center py-12">
          <Calendar size={32} className="mx-auto text-slate-600 mb-2" />
          <p className="text-sm text-slate-500">Belum ada pengajuan izin</p>
        </div>
      ) : (
        <div className="space-y-2">
          {riwayat.map(izin => {
            const mulai = new Date(izin.tanggal_mulai + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
            const selesai = new Date(izin.tanggal_selesai + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
            const hari = Math.ceil((new Date(izin.tanggal_selesai) - new Date(izin.tanggal_mulai)) / 86400000) + 1

            return (
              <div key={izin.id} className={`border rounded-xl p-3 ${statusColor[izin.status]}`}>
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <span className="text-sm font-semibold text-slate-100">
                      {mulai === selesai ? mulai : `${mulai} – ${selesai}`}
                    </span>
                    <span className="text-[10px] text-slate-500 ml-2">{hari} hari</span>
                  </div>
                  <span className="text-[10px] font-semibold">{statusLabel[izin.status]}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className={`px-1.5 py-0.5 rounded ${izin.jenis === 'PAID' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
                    {izin.jenis === 'PAID' ? 'Berbayar' : 'Tidak Berbayar'}
                  </span>
                  <span className="text-slate-500 truncate">{izin.alasan}</span>
                </div>
                {izin.catatan_admin && (
                  <p className="text-[10px] text-slate-500 mt-1 italic">Admin: {izin.catatan_admin}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
