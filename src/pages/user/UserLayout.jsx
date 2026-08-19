import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { Home, ClipboardList, User, LogOut, HardHat } from 'lucide-react'

export default function UserLayout() {
  const { karyawan, logout } = useUserAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/user/login')
  }

  return (
    <div className="user-app">
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
