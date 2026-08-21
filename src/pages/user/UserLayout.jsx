import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { Home, ClipboardList, User, LogOut, HardHat, WifiOff, Upload, Loader2, Sun, Moon } from 'lucide-react'
import { getPendingCount } from '../../lib/offlineQueue'
import { startAutoSync, syncPendingScans, onSyncChange } from '../../lib/syncManager'

export default function UserLayout() {
  const { karyawan, logout, outdoorMode, toggleOutdoorMode } = useUserAuth()
  const navigate = useNavigate()
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [syncResult, setSyncResult] = useState(null)

  useEffect(() => {
    startAutoSync()
    refreshCount()

    const unsub = onSyncChange(status => {
      setSyncing(status.syncing)
      if (!status.syncing) {
        refreshCount()
        if (status.lastResult) {
          setSyncResult(status.lastResult)
          setTimeout(() => setSyncResult(null), 5000)
        }
      }
    })

    const handleOnline = () => { setOnline(true); refreshCount() }
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const interval = setInterval(refreshCount, 10000)

    return () => {
      unsub()
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [])

  async function refreshCount() {
    const count = await getPendingCount()
    setPendingCount(count)
  }

  async function handleManualSync() {
    if (syncing || !navigator.onLine) return
    await syncPendingScans()
  }

  function handleLogout() {
    logout()
    navigate('/user/login')
  }

  return (
    <div className={`user-app min-h-screen transition-colors duration-200 ${outdoorMode ? 'bg-black text-white font-sans' : 'bg-slate-950 text-slate-100'}`}>
      {/* Offline / pending banner */}
      {!online && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border-b border-amber-500/30 text-xs text-amber-300">
          <WifiOff size={14} className="shrink-0" />
          Tidak ada koneksi — data absen akan disimpan offline
        </div>
      )}
      {online && pendingCount > 0 && (
        <button
          onClick={handleManualSync}
          disabled={syncing}
          className="flex items-center gap-2 w-full px-4 py-2 bg-blue-500/20 border-b border-blue-500/30 text-xs text-blue-300 hover:bg-blue-500/30 transition-colors"
        >
          {syncing ? (
            <Loader2 size={14} className="shrink-0 animate-spin" />
          ) : (
            <Upload size={14} className="shrink-0" />
          )}
          {syncing
            ? 'Mengirim data offline...'
            : `${pendingCount} absen tersimpan offline — ketuk untuk kirim`
          }
        </button>
      )}
      {syncResult && syncResult.failed > 0 && (
        <div className="px-4 py-2 bg-red-500/20 border-b border-red-500/30 text-xs text-red-300">
          Gagal mengirim {syncResult.failed} data. {syncResult.lastError}
        </div>
      )}
      {syncResult && syncResult.synced > 0 && syncResult.failed === 0 && (
        <div className="px-4 py-2 bg-emerald-500/20 border-b border-emerald-500/30 text-xs text-emerald-300">
          {syncResult.synced} data berhasil dikirim!
        </div>
      )}

      {/* Top bar with Global Outdoor Mode Toggle */}
      <div className={`user-topbar flex items-center justify-between border-b ${outdoorMode ? 'bg-black border-slate-800' : 'bg-slate-900/90 border-slate-800/80'}`}>
        <div className="flex items-center gap-2.5">
          <HardHat size={22} className="text-cyan-400 shrink-0" />
          <div>
            <div className="text-sm font-extrabold text-white leading-tight">{karyawan?.nama}</div>
            <div className="text-[10px] text-cyan-300 font-bold">{karyawan?.jabatan}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 1 Single Global Outdoor Mode Toggle Button */}
          <button
            onClick={toggleOutdoorMode}
            title="Sakelar Mode Terik Matahari / Outdoor"
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md ${
              outdoorMode
                ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/50 border border-amber-300'
                : 'bg-slate-800 text-cyan-300 hover:text-white border border-slate-700'
            }`}
          >
            <Sun size={14} className={outdoorMode ? 'animate-spin text-slate-950' : 'text-amber-400'} />
            <span>{outdoorMode ? 'Terik Aktif' : 'Mode Outdoor'}</span>
          </button>

          <button onClick={handleLogout} title="Keluar" className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className={`user-content pb-20 ${outdoorMode ? 'bg-black' : ''}`}>
        <Outlet />
      </div>

      {/* Bottom Navigation Bar */}
      <div className={`user-bottom-nav ${outdoorMode ? 'bg-black border-t border-slate-800 shadow-2xl' : 'bg-slate-900/95 border-t border-slate-800'}`}>
        <NavLink to="/user" end className={({ isActive }) => `user-nav-item ${isActive ? 'active text-cyan-400 font-bold' : 'text-slate-400'}`}>
          <Home size={20} />
          <span>Beranda</span>
        </NavLink>
        <NavLink to="/user/riwayat" className={({ isActive }) => `user-nav-item ${isActive ? 'active text-cyan-400 font-bold' : 'text-slate-400'}`}>
          <ClipboardList size={20} />
          <span>Riwayat</span>
        </NavLink>
        <NavLink to="/user/profil" className={({ isActive }) => `user-nav-item ${isActive ? 'active text-cyan-400 font-bold' : 'text-slate-400'}`}>
          <User size={20} />
          <span>Profil</span>
        </NavLink>
      </div>
    </div>
  )
}
