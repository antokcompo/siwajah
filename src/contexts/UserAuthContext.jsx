import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const UserAuthContext = createContext(null)

function getProjectTime(tz) {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now)
  const get = type => parts.find(p => p.type === type)?.value || '0'
  const hour = parseInt(get('hour'))
  const minute = parseInt(get('minute'))
  return {
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
    formatted: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    date: now,
  }
}

export function UserAuthProvider({ children }) {
  const [karyawan, setKaryawan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [projectTz, setProjectTz] = useState('Asia/Jayapura')

  // Global Outdoor Mode state for all user pages
  const [outdoorMode, setOutdoorMode] = useState(() => {
    return localStorage.getItem('siwajah_outdoor_mode') === 'true'
  })

  const toggleOutdoorMode = () => {
    setOutdoorMode(prev => {
      const next = !prev
      localStorage.setItem('siwajah_outdoor_mode', next.toString())
      return next
    })
  }

  useEffect(() => {
    // Clear legacy localStorage session if present
    localStorage.removeItem('siwajah_user')

    // Use sessionStorage so closing app / opening shortcut requires fresh login
    const stored = sessionStorage.getItem('siwajah_user')
    let uId = null
    if (stored) {
      try {
        const u = JSON.parse(stored)
        setKaryawan(u)
        uId = u.id
      } catch { /* ignore */ }
    }
    setLoading(false)
    loadTimezone(uId)
  }, [])

  async function loadTimezone(karyawanId) {
    let targetKode = null
    if (karyawanId) {
      const { data: kData } = await supabase
        .from('absen_karyawan')
        .select('kode_proyek')
        .eq('id', karyawanId)
        .maybeSingle()
      if (kData?.kode_proyek) targetKode = kData.kode_proyek
    }

    if (!targetKode) {
      try {
        const saved = localStorage.getItem('siwajah_active_project')
        if (saved) {
          const p = JSON.parse(saved)
          if (p?.kode) targetKode = p.kode
        }
      } catch (e) {}
    }

    if (targetKode) {
      const { data: projData } = await supabase
        .from('absen_proyek')
        .select('zona_waktu')
        .eq('kode_proyek', targetKode)
        .maybeSingle()
      if (projData?.zona_waktu) {
        setProjectTz(projData.zona_waktu)
        return
      }
    }

    const { data } = await supabase
      .from('absen_konfigurasi')
      .select('value')
      .eq('key', 'zona_waktu')
      .maybeSingle()
    if (data?.value) setProjectTz(data.value)
  }

  async function login(noHp, pin) {
    const { data, error } = await supabase.rpc('absen_user_login', {
      p_no_hp: noHp,
      p_pin: pin,
    })
    if (error) throw new Error(error.message)
    if (data.error) throw new Error(data.error)

    const user = {
      id: data.karyawan_id,
      nama: data.nama,
      jabatan: data.jabatan,
    }
    setKaryawan(user)
    sessionStorage.setItem('siwajah_user', JSON.stringify(user))
    loadTimezone(data.karyawan_id)
    return user
  }

  function logout() {
    setKaryawan(null)
    sessionStorage.removeItem('siwajah_user')
    localStorage.removeItem('siwajah_user')
  }

  return (
    <UserAuthContext.Provider value={{
      karyawan,
      loading,
      login,
      logout,
      projectTz,
      outdoorMode,
      toggleOutdoorMode,
      getProjectTime: () => getProjectTime(projectTz)
    }}>
      {children}
    </UserAuthContext.Provider>
  )
}

export function useUserAuth() {
  const ctx = useContext(UserAuthContext)
  if (!ctx) throw new Error('useUserAuth must be inside UserAuthProvider')
  return ctx
}
