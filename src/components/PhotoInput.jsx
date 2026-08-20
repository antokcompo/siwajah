import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, FolderOpen, X, SwitchCamera } from 'lucide-react'
import { compressImage } from '../lib/imageCompressor'

export default function PhotoInput({ preview, onCapture, onRemove, label = 'Foto Evidence' }) {
  const fileRef = useRef(null)
  const [showCamera, setShowCamera] = useState(false)
  const [compressing, setCompressing] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCompressing(true)
    try {
      const result = await compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.7 })
      onCapture(result.file, result.url)
    } catch (err) {
      console.warn('Compress failed, using original file:', err)
      onCapture(file, URL.createObjectURL(file))
    } finally {
      setCompressing(false)
      e.target.value = ''
    }
  }

  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1.5">{label}</label>
      {preview ? (
        <div className="relative inline-block">
          <img src={preview} alt="Foto" className="w-32 h-32 rounded-xl object-cover border-2 border-white/10" />
          <button type="button" onClick={onRemove} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
            <X size={12} className="text-white" />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            disabled={compressing}
            className="flex flex-col items-center gap-2 py-5 border-2 border-dashed border-slate-700 rounded-xl hover:border-cyan-500/50 transition-colors disabled:opacity-50"
          >
            <Camera size={22} className="text-cyan-400" />
            <span className="text-[11px] text-slate-400">
              {compressing ? 'Mengompresi...' : 'Ambil Foto'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={compressing}
            className="flex flex-col items-center gap-2 py-5 border-2 border-dashed border-slate-700 rounded-xl hover:border-cyan-500/50 transition-colors disabled:opacity-50"
          >
            <FolderOpen size={22} className="text-slate-400" />
            <span className="text-[11px] text-slate-400">
              {compressing ? 'Mengompresi...' : 'Pilih File'}
            </span>
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

      {showCamera && (
        <CameraModal
          onClose={() => setShowCamera(false)}
          onCapture={(file, url) => { onCapture(file, url); setShowCamera(false) }}
        />
      )}
    </div>
  )
}

function CameraModal({ onClose, onCapture }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [facingMode, setFacingMode] = useState('environment')
  const [capturing, setCapturing] = useState(false)

  const startCamera = useCallback(async (facing) => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      setReady(false)
      setError('')

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => setReady(true)
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Akses kamera ditolak. Izinkan akses kamera di pengaturan browser.')
      } else if (err.name === 'NotFoundError') {
        setError('Kamera tidak ditemukan pada perangkat ini.')
      } else {
        setError('Gagal mengakses kamera: ' + err.message)
      }
    }
  }, [])

  useEffect(() => {
    startCamera(facingMode)
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  function switchCamera() {
    const next = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(next)
    startCamera(next)
  }

  async function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || capturing) return

    setCapturing(true)
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)

    canvas.toBlob(async blob => {
      if (!blob) {
        setCapturing(false)
        return
      }
      try {
        const result = await compressImage(blob, { maxWidth: 800, maxHeight: 800, quality: 0.7 })
        onCapture(result.file, result.url)
      } catch (err) {
        console.warn('Compress camera image failed, fallback:', err)
        const file = new File([blob], `foto_${Date.now()}.jpg`, { type: 'image/jpeg' })
        const url = URL.createObjectURL(blob)
        onCapture(file, url)
      } finally {
        setCapturing(false)
      }
    }, 'image/jpeg', 0.85)
  }

  function handleClose() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <button type="button" onClick={handleClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
          <X size={22} className="text-white" />
        </button>
        <span className="text-sm font-medium text-white">Ambil Foto</span>
        <button type="button" onClick={switchCamera} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
          <SwitchCamera size={20} className="text-white" />
        </button>
      </div>

      {/* Video area */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden relative">
        {error ? (
          <div className="text-center px-8">
            <Camera size={48} className="mx-auto text-slate-600 mb-3" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="max-w-full max-h-full object-contain"
              style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
            />
            {(!ready || capturing) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 gap-2">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {capturing && <span className="text-xs text-white font-medium">Mengompresi Foto...</span>}
              </div>
            )}
          </>
        )}
      </div>

      {/* Capture button */}
      <div className="flex items-center justify-center py-6 bg-black/80">
        <button
          type="button"
          onClick={capture}
          disabled={!ready || capturing}
          className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center transition-all active:scale-90 disabled:opacity-30"
        >
          <div className="w-12 h-12 rounded-full bg-white" />
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
