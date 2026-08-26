import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { loadModels, detectFace, findBestMatch, getConfidenceLevel, withTimeout } from '../../lib/faceApi'
import { CheckCircle, AlertTriangle, Camera, MapPin, MapPinOff, WifiOff, ShieldAlert } from 'lucide-react'
import { savePendingScan, cacheFaceData, getCachedFaceData } from '../../lib/offlineQueue'
import { compressImage } from '../../lib/imageCompressor'
import { analyzeGpsIntegrity } from '../../lib/geoUtils'

function captureSnapshot(videoEl) {
  const canvas = document.createElement('canvas')
  canvas.width = videoEl.videoWidth || 320
  canvas.height = videoEl.videoHeight || 240
  const ctx = canvas.getContext('2d')
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.7))
}

function getUserTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return null }
}

export default function UserScan() {
  const { karyawan, projectTz, outdoorMode } = useUserAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const slot = location.state?.slot

  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [phase, setPhase] = useState('camera')
  const [error, setError] = useState('')
  const [confidence, setConfidence] = useState(0)
  const [fotoBlob, setFotoBlob] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)

  const [lokasi, setLokasi] = useState('')
  const [pekerjaan, setPekerjaan] = useState('')
  const [keterangan, setKeterangan] = useState('')
  const [gps, setGps] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const [masterLokasi, setMasterLokasi] = useState([])
  const [masterPekerjaan, setMasterPekerjaan] = useState([])

  const confLevel = getConfidenceLevel(confidence)
  const userTz = getUserTz()
  const isOffsite = userTz && userTz !== projectTz

  useEffect(() => {
    if (!slot) { navigate('/user'); return }
    let stopped = false

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        })
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return }

        streamRef.current = stream
        videoRef.current.srcObject = stream
        await videoRef.current.play()

        await loadModels()
      } catch (err) {
        if (!stopped) setError('Gagal mengakses kamera: ' + err.message)
      }
    }

    init()
    loadMasterData()
    getGps()
    return () => {
      stopped = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  async function loadMasterData() {
    if (navigator.onLine) {
      const [lokRes, pekRes] = await Promise.all([
        supabase.rpc('absen_get_master_lokasi'),
        supabase.rpc('absen_get_master_pekerjaan'),
      ])
      const lok = lokRes.data || []
      const pek = pekRes.data || []
      setMasterLokasi(lok)
      setMasterPekerjaan(pek)
      try { localStorage.setItem('siwajah_master_lokasi', JSON.stringify(lok)); localStorage.setItem('siwajah_master_pekerjaan', JSON.stringify(pek)) } catch {}
    } else {
      try {
        setMasterLokasi(JSON.parse(localStorage.getItem('siwajah_master_lokasi') || '[]'))
        setMasterPekerjaan(JSON.parse(localStorage.getItem('siwajah_master_pekerjaan') || '[]'))
      } catch {}
    }
  }

  function getGps() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => {
        const analysis = analyzeGpsIntegrity(pos)
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          isMock: analysis.isMock,
          fakeGpsScore: analysis.score,
          reasons: analysis.reasons
        })
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  async function handleScanFace() {
    setError('')
    setPhase('detecting')

    try {
      const detection = await detectFace(videoRef.current)
      if (!detection) {
        setError('Wajah tidak terdeteksi, coba lagi')
        setPhase('camera')
        return
      }

      let faces = null
      if (navigator.onLine) {
        try {
          const fetchPromise = supabase.rpc('absen_get_all_face_data')
          const { data } = await withTimeout(fetchPromise, 6000, 'Timeout fetch face data')
          faces = data
          if (faces && faces.length > 0) {
            try { await cacheFaceData(faces) } catch {}
          }
        } catch (_err) {
          console.warn('Online face fetch failed or timed out, using offline cache:', _err)
          try { faces = await getCachedFaceData() } catch {}
        }
      } else {
        try { faces = await getCachedFaceData() } catch {}
      }
      if (!faces || faces.length === 0) {
        setError('Belum ada data wajah terdaftar' + (!navigator.onLine ? '. Hubungkan ke internet untuk sinkronisasi data wajah.' : ''))
        setPhase('camera')
        return
      }

      const match = findBestMatch(detection.descriptor, faces)
      if (!match) {
        setError('Wajah tidak dikenali. Pastikan wajah sudah terdaftar.')
        setPhase('camera')
        return
      }

      if (match.match.karyawan_id !== karyawan.id) {
        setError('Wajah tidak cocok dengan akun Anda')
        setPhase('camera')
        return
      }

      const blob = await captureSnapshot(videoRef.current)
      setFotoBlob(blob)
      setFotoPreview(URL.createObjectURL(blob))
      setConfidence(match.confidence)
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      setPhase('form')
    } catch (err) {
      setError('Gagal verifikasi: ' + err.message)
      setPhase('camera')
    }
  }

  async function saveOffline() {
    const waktuScan = new Date().toISOString()
    let photoArray = null
    if (fotoBlob) {
      const buf = await fotoBlob.arrayBuffer()
      photoArray = new Uint8Array(buf)
    }
    await savePendingScan({
      karyawan_id: karyawan.id,
      slot_id: slot.id,
      lokasi_kerja: lokasi || null,
      jenis_pekerjaan: pekerjaan || null,
      keterangan: keterangan || null,
      fotoData: photoArray,
      gps_lat: gps?.lat || null,
      gps_lng: gps?.lng || null,
      confidence,
      client_tz: getUserTz(),
      is_mock_gps: gps?.isMock || false,
      gps_accuracy: gps?.accuracy || null,
      fake_gps_score: gps?.fakeGpsScore || 0,
      fake_gps_reason: gps?.reasons ? gps.reasons.join(', ') : null,
      waktu_scan: waktuScan,
      waktu_scan_epoch: Date.now(),
      slot_label: slot.label,
      slot_jam: slot.jam,
    })
    setResult({ waktu: waktuScan, slot_label: slot.label, offline: true })
    setPhase('success')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    if (!navigator.onLine) {
      try {
        await saveOffline()
      } catch (err) {
        setError('Gagal menyimpan offline: ' + err.message)
      } finally {
        setSubmitting(false)
      }
      return
    }

    try {
      const submitPromise = (async () => {
        let fotoUrl = null
        if (fotoBlob) {
          let uploadBlob = fotoBlob
          try {
            const comp = await compressImage(fotoBlob, { maxWidth: 600, maxHeight: 600, quality: 0.7 })
            uploadBlob = comp.blob
          } catch (err) {
            console.warn('Scan photo compress failed, using original blob:', err)
          }

          const filePath = `${karyawan.id}/${Date.now()}.jpg`
          const { error: uploadError } = await supabase.storage
            .from('scan-photos')
            .upload(filePath, uploadBlob, { contentType: 'image/jpeg', upsert: false })
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('scan-photos').getPublicUrl(filePath)
            fotoUrl = urlData.publicUrl
          }
        }

        let targetSlotId = slot.id
        if (targetSlotId === 'dynamic-pulang-lembur') {
          try {
            const { data: dbSlot } = await supabase.from('absen_jadwal_slot').select('id').or('jenis.eq.pulang_lembur,label.ilike.%pulang lembur%').maybeSingle()
            if (dbSlot?.id) targetSlotId = dbSlot.id
          } catch (e) {}
        }

        const { data, error: rpcError } = await supabase.rpc('absen_catat_scan_wajah', {
          p_karyawan_id: karyawan.id,
          p_slot_id: targetSlotId,
          p_lokasi_kerja: lokasi || null,
          p_jenis_pekerjaan: pekerjaan || null,
          p_keterangan: keterangan || null,
          p_foto_url: fotoUrl,
          p_gps_lat: gps?.lat || null,
          p_gps_lng: gps?.lng || null,
          p_confidence: confidence,
          p_client_tz: getUserTz(),
          p_is_mock_gps: gps?.isMock || false,
          p_gps_accuracy: gps?.accuracy || null,
          p_fake_gps_score: gps?.fakeGpsScore || 0,
          p_fake_gps_reason: gps?.reasons ? gps.reasons.join(', ') : null,
        })
        if (rpcError) throw rpcError
        if (data?.error) throw new Error(data.error)
        return data
      })()

      const data = await withTimeout(submitPromise, 8000, 'Koneksi lambat saat mengirim data presensi.')
      setResult(data)
      setPhase('success')
    } catch (err) {
      console.warn('Online submission failed or timed out, saving offline:', err)
      try {
        await saveOffline()
      } catch (offlineErr) {
        setError('Gagal mencatat presensi: ' + (err.message || offlineErr.message))
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!slot) return null

  return (
    <div className={`px-4 py-4 min-h-screen transition-colors ${outdoorMode ? 'bg-black text-white' : 'bg-slate-950 text-slate-100'}`}>
      {/* Header */}
      <div className="text-center mb-4">
        <p className="text-xs text-cyan-400 uppercase tracking-wider font-black">
          Absen {slot.jam.slice(0, 5)} — {slot.label}
        </p>
      </div>

      {/* Phase: Camera */}
      {(phase === 'camera' || phase === 'detecting') && (
        <div className="flex flex-col items-center">
          <div className="relative w-48 h-48 rounded-full overflow-hidden border-4 border-slate-700 mb-4">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            {phase === 'detecting' && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin mb-2" />
                <span className="text-xs text-emerald-300">Mengenali wajah...</span>
              </div>
            )}
          </div>

          <p className="text-sm text-slate-300 mb-4">Posisikan wajah di dalam lingkaran</p>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3 mb-4 w-full">
              <AlertTriangle size={14} className="shrink-0" /> {error}
            </div>
          )}

          <button
            onClick={handleScanFace}
            disabled={phase === 'detecting'}
            className="user-btn-primary w-full flex items-center justify-center gap-2"
          >
            <Camera size={18} /> Scan Wajah
          </button>
        </div>
      )}

      {/* Phase: Form (after face verified) */}
      {phase === 'form' && (
        <div>
          <div className={`${confLevel.bg} border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3 mb-5`}>
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <CheckCircle size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-400">Wajah Terverifikasi</p>
              <p className="text-[10px] text-slate-500">
                {karyawan.nama} &bull;{' '}
                <span className={confLevel.color}>{(confidence * 100).toFixed(0)}% cocok ({confLevel.label})</span>
              </p>
            </div>
          </div>

          {fotoPreview && (
            <div className="mb-4 flex justify-center">
              <img src={fotoPreview} alt="Foto scan" className="w-24 h-24 rounded-xl object-cover border-2 border-white/10" />
            </div>
          )}

          {gps?.isMock && (
            <div className="bg-rose-950/60 border border-rose-500/50 rounded-xl p-3 flex items-start gap-2.5 mb-4 text-xs text-rose-200">
              <ShieldAlert size={18} className="text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-300 flex items-center gap-1.5 mb-0.5">
                  <ShieldAlert size={14} className="text-rose-400" />
                  <span>Proteksi Anti-Fake GPS Terdeteksi</span>
                </span>
                <span>
                  Sistem mendeteksi indikasi sinyal GPS buatan ({gps.reasons?.join('; ')}). Scan presensi Anda akan ditandai untuk peninjauan khusus atasan.
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">Pekerjaan Saat Ini</h3>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Lokasi / Zona</label>
              {masterLokasi.length > 0 ? (
                <select value={lokasi} onChange={e => setLokasi(e.target.value)} className="user-input">
                  <option value="">Pilih lokasi...</option>
                  {masterLokasi.map(l => <option key={l.id} value={l.nama}>{l.nama}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={lokasi}
                  onChange={e => setLokasi(e.target.value)}
                  placeholder="Contoh: Lantai 5 Tower A"
                  className="user-input"
                />
              )}
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Jenis Pekerjaan</label>
              {masterPekerjaan.length > 0 ? (
                <select value={pekerjaan} onChange={e => setPekerjaan(e.target.value)} className="user-input">
                  <option value="">Pilih pekerjaan...</option>
                  {masterPekerjaan.map(p => <option key={p.id} value={p.nama}>{p.nama}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={pekerjaan}
                  onChange={e => setPekerjaan(e.target.value)}
                  placeholder="Contoh: Pemasangan Bekisting"
                  className="user-input"
                />
              )}
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Keterangan (opsional)</label>
              <textarea
                value={keterangan}
                onChange={e => setKeterangan(e.target.value)}
                placeholder="Tulis keterangan..."
                rows={2}
                className="user-input resize-none"
              />
            </div>

            {gps && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <MapPin size={12} /> GPS tercatat
              </div>
            )}

            {isOffsite && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2">
                <MapPinOff size={12} className="shrink-0" /> Di luar lokasi proyek
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3">
                <AlertTriangle size={14} className="shrink-0" /> {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="user-btn-primary w-full"
            >
              {submitting ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Mengirim...
                </div>
              ) : 'KIRIM ABSEN'}
            </button>
          </form>
        </div>
      )}

      {/* Phase: Success */}
      {phase === 'success' && (
        <div className="flex flex-col items-center text-center py-6">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mb-3">
            <CheckCircle size={32} className="text-emerald-400" />
          </div>
          <p className="text-lg font-bold text-emerald-400">Absen {slot.jam.slice(0, 5)}</p>
          <p className="text-sm text-slate-200 mb-1">Berhasil Tercatat!</p>
          {result?.offline && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400 mb-3">
              <WifiOff size={12} />
              Tersimpan offline — akan dikirim saat ada sinyal
            </div>
          )}

          <div className="bg-white/5 rounded-xl p-4 w-full text-left text-sm space-y-2 mb-4">
            <div className="flex justify-between">
              <span className="text-slate-500">Waktu</span>
              <span className="text-slate-200">{result?.waktu ? new Date(result.waktu).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</span>
            </div>
            {lokasi && (
              <div className="flex justify-between">
                <span className="text-slate-500">Lokasi</span>
                <span className="text-slate-200">{lokasi}</span>
              </div>
            )}
            {pekerjaan && (
              <div className="flex justify-between">
                <span className="text-slate-500">Pekerjaan</span>
                <span className="text-slate-200">{pekerjaan}</span>
              </div>
            )}
            {gps && (
              <div className="flex justify-between">
                <span className="text-slate-500">GPS</span>
                <span className="text-emerald-400 flex items-center gap-1"><MapPin size={12} /> On-site</span>
              </div>
            )}
            {isOffsite && (
              <div className="flex justify-between">
                <span className="text-slate-500">Lokasi</span>
                <span className="text-amber-400 flex items-center gap-1"><MapPinOff size={12} /> Di luar proyek</span>
              </div>
            )}
          </div>

          <button onClick={() => navigate('/user')} className="user-btn-secondary w-full">
            Kembali ke Beranda
          </button>
        </div>
      )}
    </div>
  )
}
