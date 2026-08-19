import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { Home, ClipboardList, User, LogOut, HardHat, WifiOff, Upload, Loader2 } from 'lucide-react'
import { getPendingCount } from '../../lib/offlineQueue'
import { startAutoSync, syncPendingScans, onSyncChange } from '../../lib/syncManager'

export default function UserLayout() {
  const { karyawan, logout } = useUserAuth()
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
    <div className="user-app">
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

      {/* Top bar */}
      <div className="user-topbar">
        <div className="flex items-center gap-2">
          <HardHat size={20} className="text-cyan-400" />
          <div>
            <div className="text-sm font-bold text-slate-100 leading-tight">{karyawan?.nama}</div>
            <div className="text-[10px] text-cyan-400">{karyawan?.jabatan}</div>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
          <LogOut size={18} className="text-slate-400" />
        </button>
      </div>

      {/* Content */}
      <div className="user-content">
        <Outlet />
      </div>

      {/* Bottom nav */}
      <div className="user-bottom-nav">
        <NavLink to="/user" end className={({ isActive }) => `user-nav-item ${isActive ? 'active' : ''}`}>
          <Home size={20} />
          <span>Beranda</span>
        </NavLink>
        <NavLink to="/user/riwayat" className={({ isActive }) => `user-nav-item ${isActive ? 'active' : ''}`}>
          <ClipboardList size={20} />
          <span>Riwayat</span>
        </NavLink>
        <NavLink to="/user/profil" className={({ isActive }) => `user-nav-item ${isActive ? 'active' : ''}`}>
          <User size={20} />
          <span>Profil</span>
        </NavLink>
      </div>
    </div>
  )
}
