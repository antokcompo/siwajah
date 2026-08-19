import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { AlertTriangle, CheckCircle, ChevronLeft } from 'lucide-react'
import PhotoInput from '../../components/PhotoInput'

export default function UserLaporan() {
  const { karyawan } = useUserAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const slot = location.state?.slot
  const tanggal = location.state?.tanggal

  const [alasan, setAlasan] = useState('')
  const [fotoFile, setFotoFile] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!slot || !tanggal) navigate('/user')
  }, [])

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
    if (alasan.trim().length < 5) {
      setError('Alasan harus minimal 5 karakter')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      let fotoUrl = null
      if (fotoFile) {
        const filePath = `laporan/${karyawan.id}/${Date.now()}.jpg`
        const { error: uploadErr } = await supabase.storage
          .from('scan-photos')
          .upload(filePath, fotoFile, { contentType: fotoFile.type, upsert: false })
        if (uploadErr) throw new Error('Gagal upload foto: ' + uploadErr.message)
        const { data: urlData } = supabase.storage.from('scan-photos').getPublicUrl(filePath)
        fotoUrl = urlData.publicUrl
      }

      const { data, error: rpcErr } = await supabase.rpc('absen_lapor_terlewat', {
        p_karyawan_id: karyawan.id,
        p_tanggal: tanggal,
        p_slot_id: slot.id,
        p_alasan: alasan.trim(),
        p_foto_url: fotoUrl,
      })
      if (rpcErr) throw rpcErr
      if (data?.error) throw new Error(data.error)

      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!slot || !tanggal) return null

  const tglLabel = new Date(tanggal + 'T00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  if (success) {
    return (
      <div className="px-4 py-8 flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-3">
          <CheckCircle size={32} className="text-emerald-400" />
        </div>
        <p className="text-lg font-bold text-emerald-400">Laporan Terkirim</p>
        <p className="text-sm text-slate-400 mt-1 mb-6">Menunggu persetujuan admin</p>
        <button onClick={() => navigate('/user')} className="user-btn-secondary">
          Kembali ke Beranda
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-400 mb-4 hover:text-slate-200 transition-colors">
        <ChevronLeft size={16} /> Kembali
      </button>

      <h2 className="text-base font-bold text-slate-100 mb-1">Lapor Absen Terlewat</h2>
      <p className="text-xs text-slate-500 mb-4">
        {tglLabel} • {slot.jam?.slice(0, 5)} — {slot.label}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-slate-400 block mb-1.5">Alasan <span className="text-red-400">*</span></label>
          <textarea
            value={alasan}
            onChange={e => setAlasan(e.target.value)}
            placeholder="Jelaskan alasan kenapa absen terlewat..."
            rows={3}
            className="user-input resize-none"
          />
          <p className="text-[10px] text-slate-600 mt-1">{alasan.trim().length}/5 karakter minimum</p>
        </div>

        <PhotoInput
          preview={fotoPreview}
          onCapture={handleCapture}
          onRemove={removePhoto}
          label="Foto Evidence"
        />

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3">
            <AlertTriangle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || alasan.trim().length < 5}
          className="user-btn-primary w-full"
        >
          {submitting ? 'Mengirim...' : 'Kirim Laporan'}
        </button>
      </form>
    </div>
  )
}
