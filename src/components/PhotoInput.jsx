import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, FolderOpen, X, SwitchCamera } from 'lucide-react'
import { compressImage } from '../lib/imageCompressor'

export default function PhotoInput({
  preview,
  previewUrl,
  onCapture,
  onPhotoCaptured,
  onRemove,
  onClear,
  label = 'Foto Evidence'
}) {
  const fileRef = useRef(null)
  const [showCamera, setShowCamera] = useState(false)
  const [compressing, setCompressing] = useState(false)

  const activePreview = preview || previewUrl
  const handleCaptured = onCapture || onPhotoCaptured || (() => {})
  const handleRemoved = onRemove || onClear || (() => {})

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCompressing(true)
    try {
      const result = await compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.7 })
      handleCaptured(result.file, result.url)
    } catch (err) {
      console.warn('Compress failed, using original file:', err)
      handleCaptured(file, URL.createObjectURL(file))
    } finally {
      setCompressing(false)
      e.target.value = ''
    }
  }

  return (
    <div>
      <label className="text-xs font-black text-white block mb-2">{label}</label>
      {activePreview ? (
        <div className="relative inline-block">
          <img src={activePreview} alt="Foto" className="w-36 h-36 rounded-2xl object-cover border-2 border-cyan-400 shadow-xl" />
          <button type="button" onClick={handleRemoved} className="absolute -top-2 -right-2 w-7 h-7 bg-rose-500 hover:bg-rose-400 rounded-full flex items-center justify-center text-white shadow-md">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            disabled={compressing}
            className="flex flex-col items-center gap-2 py-5 border-2 border-dashed border-cyan-400/80 bg-slate-950 rounded-2xl hover:border-cyan-300 hover:bg-slate-900 transition-all disabled:opacity-50 shadow-md"
          >
            <Camera size={26} className="text-cyan-400" />
            <span className="text-xs font-black text-white">
              {compressing ? 'Mengompresi...' : 'Ambil Foto'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={compressing}
            className="flex flex-col items-center gap-2 py-5 border-2 border-dashed border-slate-700 bg-slate-950 rounded-2xl hover:border-cyan-400 hover:bg-slate-900 transition-all disabled:opacity-50 shadow-md"
          >
            <FolderOpen size={26} className="text-cyan-300" />
            <span className="text-xs font-black text-white">
              {compressing ? 'Mengompresi...' : 'Pilih File'}
            </span>
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />

      {showCamera && (
        <CameraModal
          onClose={() => setShowCamera(false)}
          onCapture={(file, url) => { handleCaptured(file, url); setShowCamera(false) }}
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
      setError('')

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        try { await videoRef.current.play() } catch {}
      }
      setReady(true)
    } catch (err) {
      console.warn('Camera failed:', err)
      setError('Kamera tidak tersedia: ' + (err.message || err))
    }
  }, [])

  useEffect(() => {
    startCamera(facingMode)
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [facingMode, startCamera])

  function toggleCamera(e) {
    e?.preventDefault()
    e?.stopPropagation()
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')
  }

  async function handleCapture(e) {
    e?.preventDefault()
    e?.stopPropagation()
    if (capturing) return

    const video = videoRef.current
    if (!video) {
      console.warn('Video element not found')
      return
    }

    setCapturing(true)
    try {
      const canvas = canvasRef.current || document.createElement('canvas')
      canvas.width = video.videoWidth || 800
      canvas.height = video.videoHeight || 600
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      if (!blob) throw new Error('Gagal mengambil gambar dari kamera')

      const file = new File([blob], `evidence_${Date.now()}.jpg`, { type: 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      onCapture(file, url)
    } catch (err) {
      console.error('Capture failed:', err)
    } finally {
      setCapturing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/95 flex flex-col items-center justify-between p-4 backdrop-blur-md">
      <div className="w-full flex items-center justify-between py-2">
        <h4 className="text-sm font-black text-white">Ambil Foto Evidence</h4>
        <button type="button" onClick={onClose} className="p-2 bg-slate-900 border border-slate-700 rounded-full text-white">
          <X size={20} />
        </button>
      </div>

      <div className="relative w-full max-w-sm aspect-[4/3] bg-slate-950 rounded-3xl overflow-hidden border-2 border-cyan-400 shadow-2xl flex items-center justify-center">
        {error ? (
          <div className="text-center p-4 text-xs font-bold text-rose-300">{error}</div>
        ) : (
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
            onLoadedMetadata={() => setReady(true)}
            onCanPlay={() => setReady(true)}
            className="w-full h-full object-cover"
          />
        )}
      </div>

      <div className="w-full max-w-sm flex items-center justify-around py-4">
        <button
          type="button"
          onClick={toggleCamera}
          className="p-3.5 bg-slate-900 border border-slate-700 rounded-2xl text-cyan-300 font-extrabold text-xs flex items-center gap-1.5"
        >
          <SwitchCamera size={18} /> Putar Kamera
        </button>
        <button
          type="button"
          onClick={handleCapture}
          disabled={capturing}
          className="p-4 bg-cyan-400 hover:bg-cyan-300 active:scale-95 text-slate-950 rounded-full font-black shadow-xl shadow-cyan-400/50 disabled:opacity-40 transition-all"
        >
          <Camera size={24} />
        </button>
      </div>
    </div>
  )
}
