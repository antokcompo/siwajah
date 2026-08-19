import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { Camera, CheckCircle, Clock, Lock, ScanFace, MapPinOff } from 'lucide-react'

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
  const [hasFace, setHasFace] = useState(null)
  const [now, setNow] = useState(new Date())
  const [loading, setLoading] = useState(true)

  const userTz = getUserTz()
  const isOffsite = userTz && userTz !== projectTz

  useEffect(() => {
    loadData()
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  async function loadData() {
    setLoading(true)
    const [slotsRes, scansRes, faceRes] = await Promise.all([
      supabase.rpc('absen_get_jadwal_slot'),
      supabase.rpc('absen_scan_hari_ini', { p_karyawan_id: karyawan.id }),
      supabase.from('absen_face_data').select('id').eq('karyawan_id', karyawan.id).maybeSingle(),
    ])
    setSlots(slotsRes.data || [])
    setTodayScans(scansRes.data || [])
    setHasFace(!!faceRes.data)
    setLoading(false)
  }

  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes()

  function getSlotStatus(slot) {
    const scanned = todayScans.find(s => s.slot_id === slot.id)
    if (scanned) return 'done'

    const [h, m] = slot.jam.split(':').map(Number)
    const slotMinutes = h * 60 + m
    const diff = Math.abs(currentTimeMinutes - slotMinutes)

    if (diff <= slot.toleransi_menit) return 'active'
    if (currentTimeMinutes < slotMinutes - slot.toleransi_menit) return 'upcoming'
    return 'missed'
  }

  const nextSlot = slots.find(s => getSlotStatus(s) === 'active')
    || slots.find(s => getSlotStatus(s) === 'upcoming')

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

      {/* Offsite indicator */}
      {isOffsite && (
        <div className="flex items-center gap-2 px-3 py-2 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <MapPinOff size={14} className="text-amber-400 shrink-0" />
          <span className="text-[11px] text-amber-400">
            Di luar lokasi proyek — Anda di {userTzLabel}, proyek di {projectTzLabel}
          </span>
        </div>
      )}

      {/* Next scan card */}
      {nextSlot && (
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
                    st === 'missed' ? 'bg-red-500/5 border border-red-500/10' :
                    'opacity-40'}`}
                onClick={() => {
                  if (st === 'active') navigate('/user/scan', { state: { slot } })
                }}
              >
                {/* Status dot */}
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  st === 'done' ? 'bg-emerald-500' :
                  st === 'active' ? 'bg-emerald-400 animate-pulse' :
                  st === 'missed' ? 'bg-red-400' :
                  'bg-slate-700'
                }`} />

                {/* Time */}
                <span className={`text-sm font-semibold w-12 ${
                  st === 'active' ? 'text-emerald-400' :
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
                  ) : st === 'missed' ? (
                    <span className="text-xs text-red-400">Terlewat</span>
                  ) : (
                    <span className="text-xs text-slate-600">—</span>
                  )}
                </div>

                {/* Label */}
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${jenisColor[slot.jenis]} text-white`}>
                  {slot.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
