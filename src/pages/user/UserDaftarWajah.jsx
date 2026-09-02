import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { loadModels, detectFace, withTimeout } from '../../lib/faceApi'
import { Camera, CheckCircle, AlertTriangle, RotateCcw, User, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Check } from 'lucide-react'

const STEP_ICONS = [User, ArrowLeft, ArrowRight, ArrowUp, ArrowDown]

const STEPS = [
  { label: 'Hadap Depan', instruction: 'Posisikan wajah lurus ke kamera' },
  { label: 'Toleh Kiri', instruction: 'Tolehkan wajah sedikit ke kiri' },
  { label: 'Toleh Kanan', instruction: 'Tolehkan wajah sedikit ke kanan' },
  { label: 'Tengadah', instruction: 'Angkat wajah sedikit ke atas' },
  { label: 'Menunduk', instruction: 'Tundukkan wajah sedikit ke bawah' },
]

export default function UserDaftarWajah() {
  const { karyawan, outdoorMode } = useUserAuth()
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [step, setStep] = useState(0)
  const [descriptors, setDescriptors] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const detecting = useRef(false)

  useEffect(() => {
    let stopped = false

    async function startCamera() {
      try {
        setStatus('loading')
        await loadModels().catch(err => console.warn('loadModels warning:', err))

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        })
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          try {
            await videoRef.current.play()
            // Background warm-up with live video frame so 1st snapshot has 0ms delay
            setTimeout(() => {
              if (videoRef.current && !stopped) {
                detectFace(videoRef.current).catch(() => {})
              }
            }, 250)
          } catch {}
        }

        if (!stopped) setStatus('ready')
      } catch (err) {
        if (!stopped) {
          setError('Gagal mengakses kamera: ' + (err.message || err))
          setStatus('error')
        }
      }
    }

    startCamera()
    return () => {
      stopped = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  const capture = useCallback(async () => {
    if (detecting.current || !videoRef.current) return
    detecting.current = true
    setStatus('detecting')

    try {
      const detection = await detectFace(videoRef.current)
      if (!detection) {
        setError('Wajah tidak terdeteksi, coba lagi')
        setStatus('ready')
        detecting.current = false
        return
      }

      const newDescriptors = [...descriptors, Array.from(detection.descriptor)]
      setDescriptors(newDescriptors)
      setError('')

      if (step < STEPS.length - 1) {
        setStep(step + 1)
        setStatus('ready')
      } else {
        setStatus('done')
        await saveDescriptors(newDescriptors)
      }
    } catch (err) {
      setError('Gagal mendeteksi: ' + err.message)
      setStatus('ready')
    }
    detecting.current = false
  }, [step, descriptors])

  async function saveDescriptors(descs) {
    setSaving(true)
    try {
      const avgDescriptor = new Array(128).fill(0)
      for (const d of descs) {
        for (let i = 0; i < 128; i++) avgDescriptor[i] += d[i]
      }
      for (let i = 0; i < 128; i++) avgDescriptor[i] /= descs.length

      // Save average vector + all 5 individual angle vectors for 100% multi-angle coverage
      const multiDescriptors = [avgDescriptor, ...descs]

      const savePromise = supabase.rpc('absen_simpan_face_data', {
        p_karyawan_id: karyawan.id,
        p_descriptor: multiDescriptors,
      })
      const { data, error: rpcError } = await withTimeout(savePromise, 10000, 'Koneksi lambat saat menyimpan data wajah. Silakan coba lagi.')
      if (rpcError) throw rpcError
      setStatus('saved')
    } catch (err) {
      setError('Gagal menyimpan: ' + err.message)
      setStatus('done')
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setStep(0)
    setDescriptors([])
    setStatus('ready')
    setError('')
  }

  if (!karyawan) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-300 text-xs gap-2">
        <div className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
        <span>Memuat profil karyawan...</span>
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center px-4 py-6 min-h-screen transition-colors ${outdoorMode ? 'bg-black text-white' : 'bg-slate-950 text-slate-100'}`}>
      <h2 className="text-lg font-extrabold text-white mb-1">Daftar Wajah Presensi</h2>
      <p className="text-xs text-slate-300 font-medium mb-4">Ambil 5 foto sudut wajah untuk pendaftaran</p>

      {/* Progress dots */}
      <div className="flex gap-2 mb-5">
        {STEPS.map((s, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm
              ${i < step ? 'bg-emerald-500/20 text-emerald-400' :
                i === step ? 'bg-blue-500/20 text-blue-400 ring-2 ring-blue-400' :
                'bg-white/5 text-slate-600'}`}>
              {i < step ? <Check size={14} /> : (() => { const Icon = STEP_ICONS[i]; return <Icon size={14} /> })()}
            </div>
            <span className={`text-[10px] ${i === step ? 'text-blue-400' : 'text-slate-600'}`}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Camera viewfinder */}
      <div className="relative w-56 h-56 rounded-full overflow-hidden border-4 border-slate-700 mb-4">
        <video
          ref={(el) => {
            videoRef.current = el
            if (el && streamRef.current && el.srcObject !== streamRef.current) {
              el.srcObject = streamRef.current
              el.play().catch(() => {})
            }
          }}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        {status === 'detecting' && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
        {status === 'loading' && (
          <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin mb-2" />
            <span className="text-xs text-slate-400">Memuat kamera...</span>
          </div>
        )}
      </div>

      {/* Instruction */}
      {status === 'ready' && (
        <p className="text-sm text-slate-300 text-center mb-4">{STEPS[step]?.instruction}</p>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3 mb-4 w-full max-w-xs">
          <AlertTriangle size={14} className="shrink-0" /> {error}
        </div>
      )}

      {/* Actions */}
      {status === 'ready' && (
        <button onClick={capture} className="user-btn-primary w-full max-w-xs flex items-center justify-center gap-2">
          <Camera size={18} />
          Ambil Foto ({step + 1}/{STEPS.length})
        </button>
      )}

      {status === 'saved' && (
        <div className="text-center">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle size={32} className="text-emerald-400" />
          </div>
          <p className="text-emerald-400 font-semibold mb-1">Wajah Terdaftar!</p>
          <p className="text-xs text-slate-500 mb-4">Sekarang Anda bisa absen dengan scan wajah</p>
          <button onClick={() => navigate('/user')} className="user-btn-primary w-full max-w-xs">
            Ke Beranda
          </button>
        </div>
      )}

      {(status === 'error' || (status === 'done' && error)) && (
        <button onClick={reset} className="user-btn-secondary w-full max-w-xs flex items-center justify-center gap-2 mt-2">
          <RotateCcw size={16} /> Ulangi
        </button>
      )}

      {saving && (
        <div className="flex items-center gap-2 text-sm text-slate-400 mt-4">
          <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
          Menyimpan data wajah...
        </div>
      )}
    </div>
  )
}
