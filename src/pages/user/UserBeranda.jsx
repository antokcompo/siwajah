import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { Camera, CheckCircle, Clock, Lock, ScanFace, MapPin, MapPinOff, FileWarning, CalendarDays, Ban, AlertTriangle, X, Send } from 'lucide-react'
import { cacheFaceData } from '../../lib/offlineQueue'
import PhotoInput from '../../components/PhotoInput'

const jenisColor = {
  masuk: 'bg-emerald-500',
  progress: 'bg-blue-500',
  istirahat: 'bg-slate-500',
  pulang: 'bg-amber-500',
  lembur: 'bg-red-500',
  pulang_lembur: 'bg-purple-500',
}

const tzShortName = {
  'Asia/Jakarta': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
}

function getUserTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return null }
}

export default function UserBeranda() {
  const { karyawan, projectTz } = useUserAuth()
  const navigate = useNavigate()
  const [slots, setSlots] = useState([])
  const [todayScans, setTodayScans] = useState([])
  const [todayLaporan, setTodayLaporan] = useState([])
  const [todayIzin, setTodayIzin] = useState(null)
  const [lemburRegistered, setLemburRegistered] = useState(false)
  const [hasFace, setHasFace] = useState(null)
  const [now, setNow] = useState(new Date())
  const [loading, setLoading] = useState(true)

  // Lapor Terlewat modal state
  const [modalSlot, setModalSlot] = useState(null)
  const [laporAlasan, setLaporAlasan] = useState('')
  const [laporFotoFile, setLaporFotoFile] = useState(null)
  const [laporFotoPreview, setLaporFotoPreview] = useState(null)
  const [laporGps, setLaporGps] = useState(null)
  const [submittingLapor, setSubmittingLapor] = useState(false)
  const [laporError, setLaporError] = useState('')
  const [laporSuccess, setLaporSuccess] = useState('')

  const userTz = getUserTz()
  const isOffsite = userTz && userTz !== projectTz

  useEffect(() => {
    loadData()
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  async function loadData() {
    setLoading(true)
    const todayStr = new Date().toISOString().split('T')[0]

    const [slotsRes, scansRes, faceRes, lemburRes, laporanRes, izinRes] = await Promise.all([
      supabase.rpc('absen_get_jadwal_slot'),
      supabase.rpc('absen_scan_hari_ini', { p_karyawan_id: karyawan.id }),
      supabase.from('absen_face_data').select('id').eq('karyawan_id', karyawan.id).maybeSingle(),
      supabase.rpc('absen_cek_lembur_hari_ini', { p_karyawan_id: karyawan.id }),
      supabase.from('absen_laporan_terlewat').select('*').eq('karyawan_id', karyawan.id).eq('tanggal', todayStr),
      supabase.from('absen_izin').select('*').eq('karyawan_id', karyawan.id).eq('status', 'APPROVED').lte('tanggal_mulai', todayStr).gte('tanggal_selesai', todayStr).maybeSingle(),
    ])
    setSlots(slotsRes.data || [])
    setTodayScans(scansRes.data || [])
    setLemburRegistered(lemburRes.data === true)
    setHasFace(!!faceRes.data)
    setTodayLaporan(laporanRes.data || [])
    setTodayIzin(izinRes.data || null)
    setLoading(false)

    if (navigator.onLine && faceRes.data) {
      supabase.rpc('absen_get_all_face_data').then(({ data }) => {
        if (data?.length) cacheFaceData(data).catch(() => {})
      })
    }
  }

  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes()

  function isLemburSlot(slot) {
    return slot.jenis === 'lembur' || slot.jenis === 'pulang_lembur'
  }

  function getSlotStatus(slot) {
    if (todayIzin) return 'on_leave'

    const scanned = todayScans.find(s => s.slot_id === slot.id)
    if (scanned) return 'done'

    const pendingLap = todayLaporan.find(l => l.slot_id === slot.id && l.status === 'PENDING')
    if (pendingLap) return 'pending_laporan'

    if (isLemburSlot(slot) && !lemburRegistered) return 'not_registered'

    const [h, m] = slot.jam.split(':').map(Number)
    const slotMinutes = h * 60 + m
    const diff = Math.abs(currentTimeMinutes - slotMinutes)

    if (diff <= slot.toleransi_menit) return 'active'
    if (currentTimeMinutes < slotMinutes - slot.toleransi_menit) return 'upcoming'
    return 'missed'
  }

  function handleOpenLapor(slot) {
    setModalSlot(slot)
    setLaporAlasan('')
    setLaporFotoFile(null)
    if (laporFotoPreview) URL.revokeObjectURL(laporFotoPreview)
    setLaporFotoPreview(null)
    setLaporError('')
    setLaporGps(null)

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLaporGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }
  }

  function handleCloseLapor() {
    setModalSlot(null)
    setLaporAlasan('')
    setLaporFotoFile(null)
    if (laporFotoPreview) URL.revokeObjectURL(laporFotoPreview)
    setLaporFotoPreview(null)
    setLaporError('')
    setLaporGps(null)
  }

  async function handleLaporSubmit(e) {
    e.preventDefault()
    if (!laporAlasan || laporAlasan.trim().length < 5) {
      setLaporError('Alasan harus minimal 5 karakter')
      return
    }

    setSubmittingLapor(true)
    setLaporError('')

    try {
      let fotoUrl = null
      if (laporFotoFile) {
        try {
          const filePath = `laporan/${karyawan.id}/${Date.now()}.jpg`
          const { error: uploadErr } = await supabase.storage
            .from('scan-photos')
            .upload(filePath, laporFotoFile, { contentType: laporFotoFile.type, upsert: false })
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from('scan-photos').getPublicUrl(filePath)
            fotoUrl = urlData.publicUrl
          }
        } catch { /* ignore storage error, use fallback */ }

        if (!fotoUrl && laporFotoFile) {
          fotoUrl = await new Promise((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.readAsDataURL(laporFotoFile)
          })
        }
      }

      const todayStr = new Date().toISOString().split('T')[0]
      const gpsLat = laporGps?.lat ? Number(laporGps.lat.toFixed(6)) : null
      const gpsLng = laporGps?.lng ? Number(laporGps.lng.toFixed(6)) : null
      const lokasiStr = laporGps ? `${gpsLat}, ${gpsLng}` : null

      const { data, error: rpcErr } = await supabase.rpc('absen_lapor_terlewat', {
        p_karyawan_id: karyawan.id,
        p_tanggal: todayStr,
        p_slot_id: modalSlot.id,
        p_alasan: laporAlasan.trim(),
        p_foto_url: fotoUrl,
        p_gps_lat: gpsLat,
        p_gps_lng: gpsLng,
        p_lokasi_kerja: lokasiStr,
      })

      if (rpcErr) throw rpcErr
      if (data?.error) throw new Error(data.error)

      setLaporSuccess('Laporan absen terlewat berhasil dikirim ke admin!')
      handleCloseLapor()
      loadData()
      setTimeout(() => setLaporSuccess(''), 5000)
    } catch (err) {
      setLaporError(err.message)
    } finally {
      setSubmittingLapor(false)
    }
  }

  const nextSlot = slots.find(s => getSlotStatus(s) === 'active')
    || slots.find(s => getSlotStatus(s) === 'upcoming' && !(isLemburSlot(s) && !lemburRegistered))

  const greeting = now.getHours() < 12 ? 'Selamat Pagi' : now.getHours() < 15 ? 'Selamat Siang' : now.getHours() < 18 ? 'Selamat Sore' : 'Selamat Malam'

  const fmtDate = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const userTzLabel = tzShortName[userTz] || userTz
  const projectTzLabel = tzShortName[projectTz] || projectTz

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (hasFace === false) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center">
          <ScanFace size={32} className="text-blue-400" />
        </div>
        <h2 className="text-lg font-bold text-slate-100 mb-2">Daftarkan Wajah</h2>
        <p className="text-sm text-slate-400 mb-6">Anda perlu mendaftarkan wajah terlebih dahulu sebelum bisa absen</p>
        <button onClick={() => navigate('/user/daftar-wajah')} className="user-btn-primary flex items-center gap-2">
          <Camera size={18} /> Daftar Wajah Sekarang
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      {/* Header */}
      <div className="text-center mb-4">
        <p className="text-xs text-slate-500">{greeting}</p>
        <h2 className="text-lg font-bold text-slate-100">{karyawan?.nama}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{fmtDate}</p>
      </div>

      {/* Alert Notification */}
      {laporSuccess && (
        <div className="mb-4 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-400">
          <CheckCircle size={16} className="shrink-0" />
          <span>{laporSuccess}</span>
        </div>
      )}

      {/* Offsite indicator */}
      {isOffsite && (
        <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <MapPinOff size={14} className="text-amber-400 shrink-0" />
          <span className="text-[11px] text-amber-400">
            Di luar lokasi proyek — Anda di {userTzLabel}, proyek di {projectTzLabel}
          </span>
        </div>
      )}

      {/* Today Approved Leave Banner */}
      {todayIzin ? (
        <div className="bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/30 rounded-2xl p-5 mb-5 text-center shadow-lg">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-3 text-amber-400 border border-amber-500/30">
            <Ban size={24} />
          </div>
          <span className="text-[10px] text-amber-400 uppercase tracking-widest font-bold">STATUS HARI INI</span>
          <h3 className="text-base font-bold text-amber-300 mt-1">Sedang Masa Izin (Disetujui)</h3>
          <p className="text-xs text-amber-200/80 mt-1.5 max-w-xs mx-auto">
            Anda telah mendapatkan persetujuan {todayIzin.jenis === 'PAID' ? 'Izin Berbayar' : 'Izin Tidak Berbayar'} untuk hari ini ({todayIzin.alasan}).
          </p>
          <p className="text-[11px] text-amber-300/60 mt-2.5 italic bg-black/20 py-1.5 px-3 rounded-lg inline-block">
            Tombol absen dinonaktifkan selama masa izin.
          </p>
          <div className="mt-4 pt-3 border-t border-amber-500/20 flex justify-center">
            <button
              onClick={() => navigate('/user/izin')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold transition-all"
            >
              <FileWarning size={14} /> Ajukan Batal Izin ke Admin
            </button>
          </div>
        </div>
      ) : nextSlot && (
        <div className="bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 mb-5 text-center">
          <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-semibold">Absen Berikutnya</p>
          <p className="text-3xl font-extrabold text-emerald-400 mt-1">{nextSlot.jam.slice(0, 5)}</p>
          <p className="text-xs text-slate-500 mt-0.5">{nextSlot.label} &bull; Toleransi ±{nextSlot.toleransi_menit} menit</p>

          {getSlotStatus(nextSlot) === 'active' ? (
            <button
              onClick={() => navigate('/user/scan', { state: { slot: nextSlot } })}
              className="user-btn-primary w-full mt-4 flex items-center justify-center gap-2 text-base"
            >
              <Camera size={20} /> ABSEN SEKARANG
            </button>
          ) : (
            <div className="mt-4 flex items-center justify-center gap-2 text-slate-500 text-sm">
              <Clock size={16} />
              <span>Buka pukul {nextSlot.jam.slice(0, 5)}</span>
            </div>
          )}
        </div>
      )}

      {!nextSlot && slots.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-5 text-center">
          <p className="text-sm text-slate-400">Semua absen hari ini sudah selesai</p>
          <p className="text-xs text-slate-600 mt-1">Sampai jumpa besok!</p>
        </div>
      )}

      {/* Menu Cards */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        <button
          onClick={() => navigate('/user/izin')}
          className="flex items-center gap-2.5 p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-all text-left"
        >
          <CalendarDays size={18} className="text-cyan-400 shrink-0" />
          <div className="text-left">
            <div className="text-xs font-bold text-slate-200">Ajukan Izin</div>
            <div className="text-[10px] text-slate-500">Izin berbayar / tidak berbayar</div>
          </div>
        </button>
        <button
          onClick={() => navigate('/user/laporan-terlewat')}
          className="flex items-center gap-2.5 p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-amber-500/30 transition-all text-left"
        >
          <FileWarning size={18} className="text-amber-400 shrink-0" />
          <div className="text-left">
            <div className="text-xs font-bold text-slate-200">Laporan Terlewat</div>
            <div className="text-[10px] text-slate-500">Cek status laporan & catatan</div>
          </div>
        </button>
      </div>

      {/* Timeline */}
      <div className="mb-2">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Hari Ini</h3>
        <div className="space-y-1.5">
          {slots.map(slot => {
            const st = getSlotStatus(slot)
            const scan = todayScans.find(s => s.slot_id === slot.id)
            const scanTime = scan?.waktu_scan ? new Date(scan.waktu_scan).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : null

            return (
              <div
                key={slot.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all
                  ${st === 'active' ? 'bg-emerald-500/10 border border-emerald-500/20' :
                    st === 'done' ? 'bg-white/5' :
                    st === 'pending_laporan' ? 'bg-amber-500/5 border border-amber-500/10' :
                    st === 'missed' ? 'bg-red-500/5 border border-red-500/10' :
                    st === 'not_registered' ? 'opacity-30' :
                    'opacity-40'}`}
                onClick={() => {
                  if (st === 'active') navigate('/user/scan', { state: { slot } })
                  else if (st === 'missed') handleOpenLapor(slot)
                }}
              >
                {/* Status dot */}
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  st === 'done' ? 'bg-emerald-500' :
                  st === 'active' ? 'bg-emerald-400 animate-pulse' :
                  st === 'pending_laporan' ? 'bg-amber-400 animate-pulse' :
                  st === 'missed' ? 'bg-red-400' :
                  st === 'not_registered' ? 'bg-slate-600' :
                  'bg-slate-700'
                }`} />

                {/* Time */}
                <span className={`text-sm font-semibold w-12 ${
                  st === 'active' ? 'text-emerald-400' :
                  st === 'pending_laporan' ? 'text-amber-400' :
                  st === 'missed' ? 'text-red-400' :
                  'text-slate-200'
                }`}>{slot.jam.slice(0, 5)}</span>

                {/* Status text */}
                <div className="flex-1 min-w-0">
                  {st === 'done' ? (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle size={12} className="text-emerald-400 shrink-0" />
                      <span className="text-xs text-emerald-400">{scanTime}</span>
                      {scan?.lokasi_kerja && (
                        <span className="text-[10px] text-slate-500 truncate">• {scan.lokasi_kerja}</span>
                      )}
                    </div>
                  ) : st === 'active' ? (
                    <span className="text-xs text-emerald-300">Siap absen</span>
                  ) : st === 'pending_laporan' ? (
                    <div className="flex items-center gap-1 text-xs text-amber-400">
                      <Clock size={12} className="shrink-0" />
                      Menunggu Approval Admin
                    </div>
                  ) : st === 'missed' ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 text-xs text-red-400">
                        <FileWarning size={12} className="shrink-0" />
                        Terlewat
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleOpenLapor(slot) }}
                        className="text-[10px] bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-lg transition-colors font-medium"
                      >
                        Lapor Terlewat
                      </button>
                    </div>
                  ) : st === 'not_registered' ? (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Ban size={12} className="shrink-0" />
                      Tidak terdaftar lembur
                    </div>
                  ) : (
                    <span className="text-xs text-slate-600">—</span>
                  )}
                </div>

                {/* Label */}
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${jenisColor[slot.jenis]} text-white shrink-0`}>
                  {slot.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Missed scan warning */}
        {(() => {
          const missedNonLembur = slots.filter(s => getSlotStatus(s) === 'missed' && !isLemburSlot(s))
          if (missedNonLembur.length === 0) return null
          return (
            <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-red-400 font-semibold">{missedNonLembur.length} absen terlewat</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Segera laporkan alasan & foto bukti ke admin untuk koreksi absensi.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenLapor(missedNonLembur[0])}
                  className="text-xs bg-red-500 hover:bg-red-600 text-white font-medium px-2.5 py-1.5 rounded-lg shrink-0 flex items-center gap-1 transition-colors"
                >
                  <FileWarning size={12} /> Lapor
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Modal Lapor Absen Terlewat */}
      {modalSlot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileWarning size={18} className="text-red-400" />
                <h3 className="text-sm font-bold text-slate-100">Lapor Absen Terlewat</h3>
              </div>
              <button onClick={handleCloseLapor} className="text-slate-400 hover:text-slate-200 p-1 rounded-lg">
                <X size={18} />
              </button>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs space-y-1">
              <div className="text-slate-400">Pekerja: <span className="text-slate-200 font-medium">{karyawan?.nama}</span></div>
              <div className="text-slate-400">Slot Terlewat: <span className="text-red-400 font-semibold">{modalSlot.jam.slice(0, 5)} ({modalSlot.label})</span></div>
              <div className="text-slate-400">Tanggal: <span className="text-slate-200">{fmtDate}</span></div>
              <div className="text-slate-400 flex items-center gap-1.5 pt-1">
                <MapPin size={13} className="text-cyan-400 shrink-0" />
                <span>Posisi GPS: {laporGps ? <span className="text-cyan-300 font-mono">{laporGps.lat.toFixed(6)}, {laporGps.lng.toFixed(6)}</span> : <span className="text-slate-500 italic">Mendapatkan posisi GPS...</span>}</span>
              </div>
            </div>

            <form onSubmit={handleLaporSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Alasan Kendala <span className="text-red-400">*</span></label>
                <textarea
                  value={laporAlasan}
                  onChange={e => setLaporAlasan(e.target.value)}
                  placeholder="Jelaskan alasan terlewat (misal: Lupa scan saat masuk lokasi proyek, HP mati, sedang tugas lapangan...)"
                  rows={3}
                  className="user-input resize-none"
                  required
                />
              </div>

              <PhotoInput
                preview={laporFotoPreview}
                onCapture={(file, url) => {
                  setLaporFotoFile(file)
                  setLaporFotoPreview(url)
                }}
                onRemove={() => {
                  setLaporFotoFile(null)
                  if (laporFotoPreview) URL.revokeObjectURL(laporFotoPreview)
                  setLaporFotoPreview(null)
                }}
                label="Foto Evidence / Bukti (opsional)"
              />

              {laporError && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                  <AlertTriangle size={14} className="shrink-0" /> {laporError}
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={handleCloseLapor} className="user-btn-secondary flex-1 text-xs py-2.5">
                  Batal
                </button>
                <button type="submit" disabled={submittingLapor} className="user-btn-primary flex-1 text-xs py-2.5 flex items-center justify-center gap-1.5">
                  <Send size={14} />
                  {submittingLapor ? 'Mengirim...' : 'Kirim Laporan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

