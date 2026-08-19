import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { Camera, CheckCircle, LogOut, RefreshCw, HardHat } from 'lucide-react'

export default function UserProfil() {
  const { karyawan, logout } = useUserAuth()
  const navigate = useNavigate()
  const [hasFace, setHasFace] = useState(null)
  const [faceDate, setFaceDate] = useState(null)

  useEffect(() => {
    loadFaceStatus()
  }, [])

  async function loadFaceStatus() {
    const { data } = await supabase
      .from('absen_face_data')
      .select('created_at, updated_at')
      .eq('karyawan_id', karyawan.id)
      .maybeSingle()
    setHasFace(!!data)
    if (data) {
      setFaceDate(new Date(data.updated_at || data.created_at).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric'
      }))
    }
  }

  function handleLogout() {
    logout()
    navigate('/user/login')
  }

  return (
    <div className="px-4 py-6">
      {/* Avatar & name */}
      <div className="text-center mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border-2 border-cyan-500/30 flex items-center justify-center mx-auto mb-3">
          <HardHat size={32} className="text-cyan-400" />
        </div>
        <h2 className="text-lg font-bold text-slate-100">{karyawan?.nama}</h2>
        <p className="text-sm text-cyan-400">{karyawan?.jabatan}</p>
      </div>

      {/* Face status */}
      <div className="space-y-3 mb-6">
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-200">Data Wajah</p>
              {hasFace ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <CheckCircle size={12} className="text-emerald-400" />
                  <span className="text-xs text-emerald-400">Terdaftar</span>
                  <span className="text-[10px] text-slate-600 ml-1">• {faceDate}</span>
                </div>
              ) : (
                <p className="text-xs text-red-400 mt-1">Belum terdaftar</p>
              )}
            </div>
            <button
              onClick={() => navigate('/user/daftar-wajah')}
              className="user-btn-secondary text-xs flex items-center gap-1.5 py-2 px-3"
            >
              {hasFace ? <><RefreshCw size={12} /> Perbarui</> : <><Camera size={12} /> Daftar</>}
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3 mb-6">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Informasi</h3>
        <div className="flex justify-between">
          <span className="text-sm text-slate-400">Nama</span>
          <span className="text-sm text-slate-200">{karyawan?.nama}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-slate-400">Jabatan</span>
          <span className="text-sm text-slate-200">{karyawan?.jabatan || '-'}</span>
        </div>
      </div>

      {/* Logout */}
      <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors text-sm font-medium">
        <LogOut size={16} /> Keluar
      </button>
    </div>
  )
}
