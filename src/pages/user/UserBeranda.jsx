import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { Camera, CheckCircle, Clock, Lock, ScanFace, MapPin, MapPinOff, FileWarning, CalendarDays, Ban, AlertTriangle, X, Send, Download, Sun, Moon } from 'lucide-react'
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

function getLocalDateString(d = new Date()) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function UserBeranda() {
  const { karyawan, projectTz, outdoorMode } = useUserAuth()
  const navigate = useNavigate()
  const [slots, setSlots] = useState([])
  const [todayScans, setTodayScans] = useState([])
  const [todayLaporan, setTodayLaporan] = useState([])
  const [todayIzin, setTodayIzin] = useState(null)
  const [todayKalender, setTodayKalender] = useState(null)
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

  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    loadData()
    const timer = setInterval(() => setNow(new Date()), 30000)

    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsStandalone(true)
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    return () => {
      clearInterval(timer)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
    }
  }, [])

  const userTz = getUserTz()
  const isOffsite = userTz && userTz !== projectTz
  const isSecurity = Boolean(
    (karyawan?.jabatan || '').toLowerCase().includes('security') ||
    (karyawan?.jabatan || '').toLowerCase().includes('satpam') ||
    (karyawan?.jabatan || '').toLowerCase().includes('sec')
  )

  async function handleInstallClick() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
    }
  }

  async function loadData() {
    setLoading(true)
    const todayStr = getLocalDateString(new Date())

    const kKodeProyek = karyawan?.kode_proyek || '524006'

    const [directSlotsRes, scansRes, faceRes, lemburRes, laporanRes, izinRes, kalenderRes] = await Promise.all([
      supabase.from('absen_jadwal_slot').select('*').eq('aktif', true).eq('kode_proyek', kKodeProyek).order('urutan', { ascending: true }),
      supabase
        .from('absen_scan_wajah')
        .select('*, absen_jadwal_slot(*)')
        .eq('karyawan_id', karyawan.id)
        .eq('tanggal', todayStr),
      supabase.from('absen_face_data').select('id').eq('karyawan_id', karyawan.id).maybeSingle(),
      supabase.rpc('absen_cek_lembur_hari_ini', { p_karyawan_id: karyawan.id }),
      supabase.from('absen_laporan_terlewat').select('*').eq('karyawan_id', karyawan.id).eq('tanggal', todayStr),
      supabase.from('absen_izin').select('*').eq('karyawan_id', karyawan.id).eq('status', 'APPROVED').lte('tanggal_mulai', todayStr).gte('tanggal_selesai', todayStr).maybeSingle(),
      supabase.from('absen_kalender').select('*').eq('tanggal', todayStr).maybeSingle(),
    ])

    const isLemburApproved = !!lemburRes.data

    let targetCategory = 'REGULER'
    if (isSecurity) {
      const { data: roster } = await supabase
        .from('absen_roster_security')
        .select('shift')
        .eq('karyawan_id', karyawan.id)
        .eq('tanggal', todayStr)
        .maybeSingle()

      const shift = (roster?.shift || 'PAGI').toUpperCase()
      targetCategory = shift === 'MALAM' ? 'SECURITY_MALAM' : 'SECURITY_PAGI'
    }

    let rawSlots = directSlotsRes.data || []

    const filteredSlots = rawSlots.map(s => {
      let jam = s.jam || ''
      if (jam.startsWith('17:15') || (s.jenis === 'pulang' && jam.startsWith('17:'))) {
        jam = '17:00:00'
      }
      return { ...s, jam }
    }).filter(s => {
      const cat = s.kategori_shift || (
        (s.label || '').toLowerCase().includes('malam') || ['01:00','03:00','23:00'].includes(s.jam?.slice(0,5))
          ? 'SECURITY_MALAM'
          : ((s.label || '').toLowerCase().includes('security') ? 'SECURITY_PAGI' : 'REGULER')
      )
      const jamStr = s.jam?.slice(0, 5) || ''
      const lbl = (s.label || '').toLowerCase()
      const isLembur = s.jenis === 'lembur' || s.jenis === 'pulang_lembur' || lbl.includes('lembur')

      if (!isSecurity) {
        // KARYAWAN NON-SECURITY (Abdul Ghofur / CW / Kantor):
        if (cat !== 'REGULER') return false
        if (['06:00', '01:00', '02:00', '03:00', '04:00', '22:00', '23:00'].includes(jamStr)) return false
        if (lbl.includes('security') || lbl.includes('patroli') || lbl.includes('satpam') || lbl.includes('malam')) return false
        if (isLembur && !isLemburApproved) return false
        return true
      } else if (targetCategory === 'SECURITY_MALAM') {
        // SECURITY SHIFT MALAM:
        if (cat !== 'SECURITY_MALAM' && !lbl.includes('malam') && !['17:00','19:00','23:00','01:00','03:00','06:00'].includes(jamStr)) return false
        if (lbl.includes('pagi') && !lbl.includes('pulang malam')) return false
        return true
      } else {
        // SECURITY SHIFT PAGI:
        if (cat !== 'SECURITY_PAGI' && !lbl.includes('security')) return false
        if (lbl.includes('malam') || ['23:00','01:00','03:00'].includes(jamStr)) return false
        return true
      }
    })

    // Strict deduplication by unique JAM (08:00, 10:00, 11:30, 13:00, 15:00, 17:00)
    const seenJam = new Set()
    const uniqueSlots = []
    filteredSlots.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || (a.jam || '').localeCompare(b.jam || ''))

    for (const s of filteredSlots) {
      const jamKey = (s.jam || '').slice(0, 5)
      if (!seenJam.has(jamKey)) {
        seenJam.add(jamKey)
        uniqueSlots.push(s)
      }
    }

    setSlots(uniqueSlots)
    setTodayScans(scansRes.data || [])
    setHasFace(!!faceRes.data)
    setLemburRegistered(isLemburApproved)
    setTodayLaporan(laporanRes.data || [])
    setTodayIzin(izinRes.data || null)
    setTodayKalender(kalenderRes.data || null)

    if (faceRes.data && scansRes.data) {
      cacheFaceData(karyawan.id).catch(() => {})
    }

    setLoading(false)
  }

  const isTodayHoliday = todayKalender?.is_libur === true

  function isLemburSlot(slot) {
    return slot.jenis === 'lembur' || slot.jenis === 'pulang_lembur'
  }

  function getSlotStatus(slot) {
    if (todayIzin) return 'on_leave'
    if (isTodayHoliday && !lemburRegistered && !hasScannedLembur) return 'holiday'

    const isPulangLembur = slot.jenis === 'pulang_lembur' || String(slot.id) === 'dynamic-pulang-lembur' || (slot.label || '').toLowerCase().includes('pulang lembur')

    if (isLemburSlot(slot) && !lemburRegistered && !hasScannedLembur && !isPulangLembur) return 'not_registered'

    const scan = todayScans.find(s =>
      String(s.slot_id) === String(slot.id) ||
      (isPulangLembur && (
        s.absen_jadwal_slot?.jenis === 'pulang_lembur' ||
        (s.slot_label || '').toLowerCase().includes('pulang lembur') ||
        (s.keterangan || '').toLowerCase().includes('pulang lembur') ||
        (s.lokasi_kerja || '').toLowerCase().includes('pulang lembur')
      ))
    )
    if (scan) return 'done'

    const laporan = todayLaporan.find(l => String(l.slot_id) === String(slot.id))
    if (laporan) {
      if (laporan.status === 'PENDING') return 'pending_laporan'
      if (laporan.status === 'APPROVED') return 'done'
    }

    if (isPulangLembur) {
      return 'active'
    }

    if (!slot.jam) return 'active'
    const todayStr = getLocalDateString(now)
    const [h, m] = slot.jam.split(':').map(Number)
    const slotTime = new Date(now)
    slotTime.setHours(h, m, 0, 0)

    const windowStart = new Date(slotTime)
    windowStart.setMinutes(windowStart.getMinutes() - (slot.toleransi_menit || 30))
    const windowEnd = new Date(slotTime)
    windowEnd.setMinutes(windowEnd.getMinutes() + (slot.toleransi_menit || 30))

    if (now >= windowStart && now <= windowEnd) return 'active'
    if (now > windowEnd) return 'missed'

    return 'upcoming'
  }

  function handleOpenLapor(slot) {
    setModalSlot(slot)
    setLaporAlasan('')
    setLaporFotoFile(null)
    setLaporFotoPreview(null)
    setLaporGps(null)
    setLaporError('')
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLaporGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: true, timeout: 5000 }
      )
    }
  }

  function handleCloseLapor() {
    setModalSlot(null)
    setLaporAlasan('')
    setLaporFotoFile(null)
    setLaporFotoPreview(null)
    setLaporGps(null)
    setLaporError('')
  }

  async function handleLaporSubmit(e) {
    e.preventDefault()
    if (!laporAlasan.trim()) {
      setLaporError('Alasan terlewat wajib diisi.')
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

  const hasScannedLembur = todayScans.some(s => {
    if (!s) return false
    const slotObj = slots.find(item => String(item.id) === String(s.slot_id)) || s.absen_jadwal_slot
    const jenis = (slotObj?.jenis || '').toLowerCase()
    const label = (slotObj?.label || '').toLowerCase()
    const ket = (s.keterangan || '').toLowerCase()
    const sLabel = (s.slot_label || '').toLowerCase()
    const lokasi = (s.lokasi_kerja || '').toLowerCase()

    return (
      jenis === 'lembur' ||
      (label.includes('lembur') && !label.includes('pulang')) ||
      (ket.includes('lembur') && !ket.includes('pulang')) ||
      (sLabel.includes('lembur') && !sLabel.includes('pulang')) ||
      (lokasi.includes('lembur') && !lokasi.includes('pulang')) ||
      String(s.slot_id) === 'dynamic-pulang-lembur'
    )
  })

  // Filter base slots: remove legacy 12:00, and restrict overtime slots (19:00 / lembur) exclusively to registered & approved overtime workers
  const baseSlots = slots.filter(slot => {
    if (!isSecurity && (slot.jam?.startsWith('23:00') || slot.jam?.startsWith('01:00') || slot.jam?.startsWith('03:00') || slot.jam?.startsWith('06:00'))) return false
    if (slot.jam?.startsWith('12:00')) return false
    const isLembur = isLemburSlot(slot) || (slot.label || '').toLowerCase().includes('lembur')
    if (isLembur && !lemburRegistered && !hasScannedLembur) {
      return false
    }
    return true
  })

  // Find if a valid Pulang Lembur slot exists inside baseSlots (not filtered out)
  const validPulangLemburInBase = baseSlots.find(s =>
    s.jenis === 'pulang_lembur' || (s.label || '').toLowerCase().includes('pulang lembur')
  )

  let displaySlots = []
  if (hasScannedLembur) {
    if (validPulangLemburInBase) {
      displaySlots = baseSlots.map(s => (s.id === validPulangLemburInBase.id ? { ...s, jam: '' } : s))
    } else {
      const dynamicPulangLembur = {
        id: 'dynamic-pulang-lembur',
        jam: '',
        label: 'Pulang Lembur',
        jenis: 'pulang_lembur',
        toleransi_menit: 0,
        wajib: false,
      }
      displaySlots = [
        ...baseSlots.filter(s => !(s.jenis === 'pulang_lembur' || (s.label || '').toLowerCase().includes('pulang lembur'))),
        dynamicPulangLembur
      ]
    }
  } else {
    displaySlots = baseSlots.filter(s =>
      !(s.jenis === 'pulang_lembur' || (s.label || '').toLowerCase().includes('pulang lembur'))
    )
  }

  const nextSlot = displaySlots.find(s => getSlotStatus(s) === 'active')
    || displaySlots.find(s => getSlotStatus(s) === 'upcoming' && !(isLemburSlot(s) && !lemburRegistered))

  const greeting = now.getHours() < 12 ? 'Selamat Pagi' : now.getHours() < 15 ? 'Selamat Siang' : now.getHours() < 18 ? 'Selamat Sore' : 'Selamat Malam'

  const fmtDate = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const userTzLabel = tzShortName[userTz] || userTz
  const projectTzLabel = tzShortName[projectTz] || projectTz

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (hasFace === false) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/40 flex items-center justify-center shadow-lg">
          <ScanFace size={32} className="text-cyan-400" />
        </div>
        <h2 className="text-lg font-extrabold text-white mb-2">Daftarkan Wajah</h2>
        <p className="text-xs text-slate-300 mb-6 font-medium">Anda perlu mendaftarkan wajah terlebih dahulu sebelum bisa absen</p>
        <button onClick={() => navigate('/user/daftar-wajah')} className="user-btn-primary flex items-center gap-2 font-bold">
          <Camera size={18} /> Daftar Wajah Sekarang
        </button>
      </div>
    )
  }

  return (
    <div className={`px-4 py-4 min-h-screen transition-colors duration-200 ${outdoorMode ? 'bg-black text-white' : 'bg-slate-950 text-slate-100'}`}>
      {/* Header Profile Info */}
      <div className={`text-center mb-5 p-4 rounded-2xl border transition-all ${
        outdoorMode
          ? 'bg-black border-2 border-cyan-400 shadow-2xl text-white'
          : 'bg-slate-900/60 border border-slate-800'
      }`}>
        <p className={`text-xs font-bold ${outdoorMode ? 'text-amber-300' : 'text-slate-400'}`}>{greeting}</p>
        <h2 className={`text-xl font-black ${outdoorMode ? 'text-white tracking-wide' : 'text-slate-100'}`}>{karyawan?.nama}</h2>
        <p className={`text-xs font-medium mt-1 ${outdoorMode ? 'text-cyan-300' : 'text-slate-400'}`}>{fmtDate}</p>
      </div>

      {/* Alert Notification */}
      {laporSuccess && (
        <div className="mb-4 flex items-center gap-2 px-3.5 py-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 text-xs font-bold text-emerald-300 shadow-md">
          <CheckCircle size={18} className="shrink-0 text-emerald-400" />
          <span>{laporSuccess}</span>
        </div>
      )}

      {/* PWA Install Banner */}
      {deferredPrompt && !isStandalone && (
        <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-cyan-500/25 to-blue-500/25 border border-cyan-400/40 flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 border border-cyan-500/40">
              <Download size={20} />
            </div>
            <div>
              <h4 className="text-xs font-extrabold text-white">Install Aplikasi SI WAJAH</h4>
              <p className="text-[11px] text-slate-300">Pasang di Layar HP untuk absen offline</p>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
            className="px-3.5 py-1.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-black shrink-0 transition-all shadow-md"
          >
            Install
          </button>
        </div>
      )}

      {/* Offsite indicator */}
      {isOffsite && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 mb-4 rounded-2xl bg-amber-500/20 border border-amber-500/40 shadow-sm">
          <MapPinOff size={16} className="text-amber-400 shrink-0" />
          <span className="text-xs font-bold text-amber-300">
            Di luar lokasi proyek — Anda di {userTzLabel}, proyek di {projectTzLabel}
          </span>
        </div>
      )}

      {/* Today Approved Leave Banner */}
      {todayIzin ? (
        <div className="bg-gradient-to-br from-amber-500/25 to-amber-500/10 border-2 border-amber-500/50 rounded-2xl p-5 mb-5 text-center shadow-xl">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-3 text-amber-400 border border-amber-500/40">
            <Ban size={24} />
          </div>
          <span className="text-[11px] text-amber-300 uppercase tracking-widest font-black">STATUS HARI INI</span>
          <h3 className="text-base font-extrabold text-white mt-1">Sedang Masa Izin (Disetujui)</h3>
          <p className="text-xs text-amber-100 mt-1.5 max-w-xs mx-auto font-medium">
            Anda telah mendapatkan persetujuan {todayIzin.jenis === 'PAID' ? 'Izin Berbayar' : 'Izin Tidak Berbayar'} untuk hari ini ({todayIzin.alasan}).
          </p>
          <p className="text-xs text-amber-300 mt-2.5 font-bold bg-slate-950/60 py-1.5 px-3 rounded-xl inline-block border border-amber-500/30">
            Tombol absen dinonaktifkan selama masa izin.
          </p>
          <div className="mt-4 pt-3 border-t border-amber-500/30 flex justify-center">
            <button
              onClick={() => navigate('/user/izin')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/30 hover:bg-amber-500/40 border border-amber-400 text-white text-xs font-extrabold transition-all"
            >
              <FileWarning size={15} /> Ajukan Batal Izin ke Admin
            </button>
          </div>
        </div>
      ) : isTodayHoliday && !lemburRegistered ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-5 text-center shadow-lg">
          <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center mx-auto mb-3 text-cyan-400 border border-cyan-500/30">
            <Clock size={24} />
          </div>
          <span className="text-[11px] text-cyan-400 uppercase tracking-widest font-black">KALENDER KERJA</span>
          <h3 className="text-base font-extrabold text-white mt-1">
            Hari Ini Adalah Hari Libur
          </h3>
          <p className="text-xs text-slate-300 mt-1.5 max-w-xs mx-auto font-medium">
            {todayKalender?.keterangan || 'Libur Operasional Proyek'}. Presensi dinonaktifkan pada hari libur.
          </p>
          <p className="text-xs text-amber-300 mt-2.5 font-bold bg-slate-950/60 py-1.5 px-3 rounded-xl inline-block border border-slate-800">
            Kecuali didaftarkan lembur & disetujui admin.
          </p>
        </div>
      ) : nextSlot && (
        <div className={`rounded-3xl p-5 mb-5 text-center transition-all ${
          outdoorMode
            ? 'bg-black border-2 border-emerald-400 shadow-2xl'
            : 'bg-slate-900/90 border border-slate-800 shadow-lg'
        }`}>
          <p className="text-xs text-emerald-300 uppercase tracking-wider font-black">Absen Berikutnya</p>
          <p className="text-3xl font-black text-emerald-400 mt-1 tracking-tight">
            {nextSlot.jenis === 'pulang_lembur' || !nextSlot.jam ? nextSlot.label : nextSlot.jam.slice(0, 5)}
          </p>
          <p className="text-xs text-slate-200 mt-1 font-bold">
            {nextSlot.jenis === 'pulang_lembur' || !nextSlot.jam ? 'Jam terecord setelah absen pulang lembur' : `${nextSlot.label} • Toleransi ±${nextSlot.toleransi_menit} menit`}
          </p>

          {getSlotStatus(nextSlot) === 'active' ? (
            <button
              onClick={() => navigate('/user/scan', { state: { slot: nextSlot } })}
              className="w-full mt-4 py-3.5 rounded-2xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-400/40 transition-all border border-emerald-300 tracking-wide"
            >
              <Camera size={22} /> ABSEN SEKARANG
            </button>
          ) : (
            <div className="mt-4 flex items-center justify-center gap-2 text-slate-300 font-bold text-sm">
              <Clock size={16} className="text-emerald-400" />
              <span>{nextSlot.jam ? `Buka pukul ${nextSlot.jam.slice(0, 5)}` : 'Pulang Lembur'}</span>
            </div>
          )}
        </div>
      )}

      {!nextSlot && displaySlots.length > 0 && (
        <div className={`rounded-2xl p-5 mb-5 text-center shadow-md ${outdoorMode ? 'bg-black border-2 border-slate-800' : 'bg-slate-900/60 border border-slate-800'}`}>
          <p className="text-sm font-extrabold text-white">Semua absen hari ini sudah selesai</p>
          <p className="text-xs text-slate-400 mt-1 font-medium">Sampai jumpa besok!</p>
        </div>
      )}

      {/* Quick Action Navigation Buttons */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <button
          onClick={() => navigate('/user/izin')}
          className={`flex items-center gap-3 p-3.5 rounded-2xl transition-all text-left ${
            outdoorMode
              ? 'bg-black border-2 border-cyan-400 text-white shadow-xl'
              : 'bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 border border-cyan-500/30">
            <CalendarDays size={20} />
          </div>
          <div>
            <div className="text-xs font-black text-white">Ajukan Izin</div>
            <div className="text-[11px] text-slate-300 font-medium">Izin berbayar / tidak</div>
          </div>
        </button>
        <button
          onClick={() => navigate('/user/laporan-terlewat')}
          className={`flex items-center gap-3 p-3.5 rounded-2xl transition-all text-left ${
            outdoorMode
              ? 'bg-black border-2 border-amber-400 text-white shadow-xl'
              : 'bg-slate-900/80 border border-slate-800 hover:border-amber-500/40'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0 border border-amber-500/30">
            <FileWarning size={20} />
          </div>
          <div>
            <div className="text-xs font-black text-white">Laporan Terlewat</div>
            <div className="text-[11px] text-slate-300 font-medium">Cek status laporan</div>
          </div>
        </button>
      </div>

      {/* Timeline Section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black text-slate-300 uppercase tracking-wider">Jadwal Absen Hari Ini</h3>
          <span className="text-[11px] text-slate-400 font-medium">{displaySlots.length} Slot Hari Ini</span>
        </div>

        <div className="space-y-2">
          {displaySlots.map(slot => {
            const st = getSlotStatus(slot)
            const isPulangLembur = slot.jenis === 'pulang_lembur' || slot.id === 'dynamic-pulang-lembur' || (slot.label || '').toLowerCase().includes('pulang lembur')
            const scan = todayScans.find(s =>
              s.slot_id === slot.id ||
              (isPulangLembur && (s.absen_jadwal_slot?.jenis === 'pulang_lembur' || (s.slot_label || '').toLowerCase().includes('pulang lembur') || (s.keterangan || '').toLowerCase().includes('pulang lembur')))
            )
            const approvedLaporan = todayLaporan.find(l => l.slot_id === slot.id && l.status === 'APPROVED')
            const scanTime = scan?.waktu_scan
              ? new Date(scan.waktu_scan).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
              : (approvedLaporan ? 'Lapor Disetujui' : null)

            const displayJamLabel = isPulangLembur ? 'Pulang Lembur' : slot.jam?.slice(0, 5)

            return (
              <div
                key={slot.id}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl transition-all border ${
                  outdoorMode
                    ? st === 'active'
                      ? 'bg-emerald-950 border-2 border-emerald-400 shadow-xl'
                      : st === 'pending_laporan'
                      ? 'bg-amber-950 border-2 border-amber-400 shadow-xl'
                      : st === 'missed'
                      ? 'bg-rose-950 border-2 border-rose-500 shadow-xl'
                      : 'bg-black border-2 border-slate-800 text-white'
                    : st === 'active'
                    ? 'bg-emerald-500/10 border border-emerald-500/20'
                    : st === 'done'
                    ? 'bg-slate-900/60 border border-slate-800'
                    : st === 'pending_laporan'
                    ? 'bg-amber-500/10 border border-amber-500/20'
                    : st === 'missed'
                    ? 'bg-rose-500/10 border border-rose-500/20'
                    : 'bg-slate-900/40 border border-slate-800/80 opacity-60'
                }`}
                onClick={() => {
                  if (st === 'active') navigate('/user/scan', { state: { slot } })
                  else if (st === 'missed') handleOpenLapor(slot)
                }}
              >
                {/* Status Dot */}
                <div className={`w-3 h-3 rounded-full shrink-0 ${
                  st === 'done' ? 'bg-emerald-400 shadow-sm shadow-emerald-400' :
                  st === 'active' ? 'bg-emerald-400 animate-pulse shadow-md shadow-emerald-400' :
                  st === 'pending_laporan' ? 'bg-amber-400 animate-pulse shadow-md shadow-amber-400' :
                  st === 'missed' ? 'bg-rose-500 shadow-sm shadow-rose-500' :
                  'bg-slate-600'
                }`} />

                {/* Time or Label */}
                <span className={`text-sm font-black ${isPulangLembur ? 'w-32 text-emerald-300' : 'w-14 text-white'} ${
                  st === 'active' ? 'text-emerald-300' :
                  st === 'pending_laporan' ? 'text-amber-300' :
                  st === 'missed' ? 'text-rose-400' :
                  'text-white'
                }`}>{displayJamLabel}</span>

                {/* Status Content */}
                <div className="flex-1 min-w-0 font-sans">
                  {st === 'done' ? (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle size={14} className="text-emerald-400 shrink-0" />
                      <span className="text-xs font-extrabold text-emerald-300">
                        Berhasil {scanTime ? `(${scanTime})` : ''}
                      </span>
                      {scan?.lokasi_kerja && (
                        <span className="text-[11px] text-slate-300 truncate font-medium">• {scan.lokasi_kerja}</span>
                      )}
                    </div>
                  ) : st === 'active' ? (
                    <span className="text-xs font-black text-emerald-300 uppercase tracking-wide">Siap Absen Sekarang</span>
                  ) : st === 'pending_laporan' ? (
                    <div className="flex items-center gap-1 text-xs font-bold text-amber-300">
                      <Clock size={13} className="shrink-0" />
                      Menunggu Approval Admin
                    </div>
                  ) : st === 'missed' ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 text-xs font-extrabold text-rose-300">
                        <FileWarning size={13} className="shrink-0" />
                        Terlewat
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleOpenLapor(slot) }}
                        className="text-xs bg-rose-500 hover:bg-rose-400 text-white font-extrabold px-2.5 py-1 rounded-xl transition-colors shadow-sm"
                      >
                        {isLemburSlot(slot) ? 'Lapor (H+1)' : 'Lapor Terlewat'}
                      </button>
                    </div>
                  ) : st === 'holiday' ? (
                    <div className="flex items-center gap-1 text-xs text-slate-300 font-bold">
                      <Clock size={13} className="shrink-0 text-slate-400" />
                      Hari Libur (Presensi Tutup)
                    </div>
                  ) : st === 'on_leave' ? (
                    <div className="flex items-center gap-1 text-xs text-amber-300 font-bold">
                      <Ban size={13} className="shrink-0" />
                      Masa Izin
                    </div>
                  ) : (
                    <span className="text-xs text-slate-300 font-semibold">{slot.label}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Lapor Terlewat Modal */}
      {modalSlot && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md ${outdoorMode ? 'bg-black/90' : 'bg-slate-950/80'}`}>
          <form onSubmit={handleLaporSubmit} className={`rounded-3xl p-5 max-w-md w-full space-y-4 shadow-2xl transition-all ${
            outdoorMode
              ? 'bg-black border-2 border-cyan-400 text-white shadow-cyan-950/80'
              : 'bg-slate-900 border border-slate-800'
          }`}>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileWarning className="text-amber-400" size={20} />
                <h3 className="font-bold text-white text-base">Lapor Absen Terlewat</h3>
              </div>
              <button type="button" onClick={handleCloseLapor} className="p-1 text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {laporError && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-xs text-rose-300 font-bold">
                {laporError}
              </div>
            )}

            <div className="space-y-3 text-xs text-slate-300 font-sans">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                <div>Slot: <strong className="text-white">{modalSlot.label} ({modalSlot.jam.slice(0, 5)})</strong></div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">Alasan Terlewat (Wajib)</label>
                <textarea
                  value={laporAlasan}
                  onChange={e => setLaporAlasan(e.target.value)}
                  placeholder="Contoh: Terkendala sinyal seluler di area kerja..."
                  className="w-full h-20 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">Foto Bukti (Opsional)</label>
                <PhotoInput
                  preview={laporFotoPreview}
                  onCapture={(file, preview) => {
                    setLaporFotoFile(file)
                    setLaporFotoPreview(preview)
                  }}
                  onRemove={() => {
                    setLaporFotoFile(null)
                    setLaporFotoPreview(null)
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={handleCloseLapor}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submittingLapor || !laporAlasan.trim()}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-lg shadow-amber-950/60"
              >
                {submittingLapor ? (
                  <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                <span>Kirim Laporan</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
