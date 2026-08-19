import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, FolderOpen, X, SwitchCamera } from 'lucide-react'

export default function PhotoInput({ preview, onCapture, onRemove, label = 'Foto Evidence' }) {
  const fileRef = useRef(null)
  const [showCamera, setShowCamera] = useState(false)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    onCapture(file, URL.createObjectURL(file))
    e.target.value = ''
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
            className="flex flex-col items-center gap-2 py-5 border-2 border-dashed border-slate-700 rounded-xl hover:border-cyan-500/50 transition-colors"
          >
            <Camera size={22} className="text-cyan-400" />
            <span className="text-[11px] text-slate-400">Ambil Foto</span>
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2 py-5 border-2 border-dashed border-slate-700 rounded-xl hover:border-cyan-500/50 transition-colors"
          >
            <FolderOpen size={22} className="text-slate-400" />
            <span className="text-[11px] text-slate-400">Pilih File</span>
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

  function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)

    canvas.toBlob(blob => {
      if (!blob) return
      const file = new File([blob], `foto_${Date.now()}.jpg`, { type: 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      onCapture(file, url)
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
        <button onClick={handleClose} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
          <X size={22} className="text-white" />
        </button>
        <span className="text-sm font-medium text-white">Ambil Foto</span>
        <button onClick={switchCamera} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
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
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Capture button */}
      <div className="flex items-center justify-center py-6 bg-black/80">
        <button
          onClick={capture}
          disabled={!ready}
          className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center transition-all active:scale-90 disabled:opacity-30"
        >
          <div className="w-12 h-12 rounded-full bg-white" />
        </button>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
