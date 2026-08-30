import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getActiveProject } from '../pages/PilihProyek'
import {
  LayoutDashboard, Upload, CalendarDays, FileEdit, Clock,
  Users, Settings, CalendarCheck, FileSpreadsheet, Shield, UserCog,
  Menu, X, LogOut, KeyRound, Eye, EyeOff, CheckCircle, AlertTriangle,
  Timer, FileWarning, Lock, Layers, Building2, FolderSync
} from 'lucide-react'
import GlobalDynamicSearch from './GlobalDynamicSearch'

const menuGroups = [
  {
    label: 'UTAMA',
    items: [
      { path: '/siwajah', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin','atasan','hrd','manajemen'] },
      { path: '/import', label: 'Import Absensi', icon: Upload, roles: ['admin','atasan','hrd'] },
      { path: '/rekap-harian', label: 'Rekap Harian', icon: CalendarDays, roles: ['admin','atasan','hrd','manajemen'] },
    ],
  },
  {
    label: 'ABSENSI',
    items: [
      { path: '/koreksi', label: 'Koreksi', icon: FileEdit, roles: ['admin','atasan'] },
      { path: '/approval-lembur', label: 'Lembur', icon: Clock, roles: ['admin','atasan'] },
      { path: '/laporan-izin', label: 'Laporan & Izin', icon: FileWarning, roles: ['admin','atasan'] },
      { path: '/rekap-bulanan', label: 'Rekap Bulanan', icon: FileSpreadsheet, roles: ['admin','hrd','manajemen'] },
    ],
  },
  {
    label: 'MASTER & PENGATURAN',
    items: [
      { path: '/master-karyawan', label: 'Master Karyawan', icon: Users, roles: ['admin','hrd'] },
      { path: '/roster-security', label: 'Roster Security', icon: Shield, roles: ['admin','atasan','hrd','manajemen'] },
      { path: '/kalender', label: 'Kalender Kerja', icon: CalendarCheck, roles: ['admin'] },
      { path: '/jadwal-slot', label: 'Jadwal Slot Absen', icon: Timer, roles: ['admin'] },
      { path: '/tutup-absen', label: 'Tutup Absen', icon: Lock, roles: ['admin','manajemen','hrd'] },
      { path: '/manajemen-user', label: 'Manajemen User', icon: UserCog, roles: ['admin'] },
      { path: '/konfigurasi', label: 'Konfigurasi', icon: Settings, roles: ['admin'] },
      { path: '/audit-log', label: 'Audit Log', icon: Shield, roles: ['admin','hrd','manajemen'] },
    ],
  },
]

const roleLabel = {
  admin: 'Admin',
  atasan: 'Supervisor',
  hrd: 'HRD',
  manajemen: 'Manajemen',
}

function checkPassword(pw) {
  return [
    { ok: pw.length >= 8, label: 'Minimal 8 karakter' },
    { ok: /[A-Z]/.test(pw), label: 'Huruf besar (A-Z)' },
    { ok: /[a-z]/.test(pw), label: 'Huruf kecil (a-z)' },
    { ok: /[0-9]/.test(pw), label: 'Angka (0-9)' },
    { ok: /[^A-Za-z0-9]/.test(pw), label: 'Simbol (!@#$...)' },
  ]
}

function PasswordField({ value, onChange, placeholder, id }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required
        className="input-field pr-11"
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all duration-200"
        style={{ color: show ? '#67e8f9' : '#475569' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        tabIndex={-1}
      >
        {show ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
      </button>
    </div>
  )
}

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const { user, profile, loading, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'SI Wajah — Sistem Informasi Web Absensi dan Aktifitas Harian'
  }, [])

  if (loading) return <div className="flex items-center justify-center h-screen bg-[#0a0e1a]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" /></div>
  if (!user) return <Navigate to="/login" replace />

  const role = profile?.role

  function handleSignOut() {
    signOut()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      {/* Mobile top bar */}
      <header className="mobile-topbar lg:hidden">
        <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-1 hover:bg-white/10 rounded-lg transition-colors">
          <Menu size={24} className="text-white" />
        </button>
        <div className="flex items-center gap-2.5">
          <img src="/logo-pp-icon.png" alt="PT PP" className="w-8 h-8" style={{ filter: 'grayscale(1) contrast(9) invert(1)', mixBlendMode: 'screen' }} />
          <span className="font-bold text-white text-base tracking-wide">SI WAJAH</span>
        </div>
        <GlobalDynamicSearch />
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" style={{ animation: 'overlay-in 0.25s ease-out forwards' }}>
          <div className="fixed inset-0" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 w-[min(85vw,320px)] z-50" style={{ animation: 'sidebar-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <SidebarContent role={role} location={location} profile={profile} onSignOut={handleSignOut} onClose={() => setSidebarOpen(false)} onChangePassword={() => setShowChangePassword(true)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sidebar-desktop hidden lg:flex">
        <SidebarContent role={role} location={location} profile={profile} onSignOut={handleSignOut} onChangePassword={() => setShowChangePassword(true)} />
      </aside>

      {/* Main content */}
      <div className="main-area">
        {children || <Outlet />}
      </div>

      {/* Change Password Modal */}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </div>
  )
}

function SidebarContent({ role, location, profile, onSignOut, onClose, onChangePassword }) {
  const activeProj = getActiveProject()

  return (
    <div className="sidebar-inner">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="flex items-center gap-3">
          <img src="/logo-pp-icon.png" alt="PT PP" className="w-11 h-11 shrink-0" style={{ filter: 'grayscale(1) contrast(9) invert(1)', mixBlendMode: 'screen' }} />
          <div className="min-w-0">
            <h2 className="font-bold text-lg leading-tight tracking-wide" style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SI WAJAH</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Absensi & Aktifitas Harian</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
            <X size={20} style={{ color: 'var(--text-muted)' }} />
          </button>
        )}
      </div>

      {/* Active Project Banner */}
      <div className="px-3.5 py-2.5 mx-3 my-2 rounded-2xl bg-gradient-to-r from-cyan-950/60 to-slate-900 border border-cyan-500/30 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 size={16} className="text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Proyek Aktif</div>
            <div className="text-xs font-black text-cyan-200 truncate">{activeProj?.nama_singkat || activeProj?.nama || 'Proyek Utama'}</div>
          </div>
        </div>
        <Link
          to="/pilih-proyek"
          className="p-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/40 transition-colors shrink-0 text-[10px] font-bold flex items-center gap-1 border border-cyan-500/40"
          title="Ganti Proyek"
        >
          <FolderSync size={13} />
          <span>Ganti</span>
        </Link>
      </div>

      {/* Global Dynamic Search */}
      <div className="px-4 py-2 border-b border-slate-800/60">
        <GlobalDynamicSearch />
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {menuGroups.map(group => {
          const visibleItems = group.items.filter(m => !role || m.roles.includes(role))
          if (visibleItems.length === 0) return null
          return (
            <div key={group.label}>
              <div className="section-label">{group.label}</div>
              {visibleItems.map(m => {
                const Icon = m.icon
                const active = location.pathname === m.path
                return (
                  <Link
                    key={m.path}
                    to={m.path}
                    onClick={onClose}
                    className={`nav-item ${active ? 'nav-item--active' : ''}`}
                  >
                    <Icon size={20} className={active ? 'text-cyan-300' : ''} style={active ? {} : { color: 'var(--text-muted)' }} />
                    {m.label}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* User section */}
      <div className="sidebar-user">
        <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-base shrink-0" style={{ background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(59, 130, 246, 0.2))', border: '1px solid rgba(6, 182, 212, 0.25)', color: '#67e8f9' }}>
          {(profile?.nama || 'U').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-white truncate">{profile?.nama || 'User'}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{roleLabel[profile?.role] || profile?.role}</div>
        </div>
        <button
          onClick={onChangePassword}
          className="p-2 hover:bg-cyan-500/20 rounded-lg transition-colors shrink-0"
          title="Ganti Password"
        >
          <KeyRound size={17} style={{ color: 'var(--text-muted)' }} />
        </button>
        <button
          onClick={onSignOut}
          className="p-2 hover:bg-red-500/20 rounded-lg transition-colors shrink-0"
          title="Keluar"
        >
          <LogOut size={18} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>
    </div>
  )
}

function ChangePasswordModal({ onClose }) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const rules = checkPassword(newPw)
  const allValid = rules.every(r => r.ok)
  const passwordsMatch = newPw === confirmPw

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!allValid) {
      setError('Password baru belum memenuhi semua persyaratan')
      return
    }
    if (!passwordsMatch) {
      setError('Konfirmasi password tidak cocok')
      return
    }

    setSaving(true)

    const { error: rpcErr } = await supabase.rpc('absen_change_own_password', {
      p_current_password: currentPw,
      p_new_password: newPw,
    })

    if (rpcErr) {
      setError(rpcErr.message.includes('Password lama') ? 'Password lama tidak sesuai' : rpcErr.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setSuccess(true)
    setTimeout(() => onClose(), 2000)
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 60 }}>
      <div className="modal-content max-w-md">
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(139, 92, 246, 0.2))' }}>
              <KeyRound size={16} style={{ color: '#67e8f9' }} />
            </div>
            <span className="font-semibold text-white">Ganti Password</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-white/10" style={{ color: '#64748b' }}>
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(52, 211, 153, 0.15)' }}>
              <CheckCircle size={28} style={{ color: '#34d399' }} />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Password Berhasil Diubah</h3>
            <p className="text-sm" style={{ color: '#64748b' }}>Gunakan password baru pada login berikutnya.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 rounded-xl flex items-start gap-2.5 text-sm" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Password Saat Ini *</label>
              <PasswordField value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Masukkan password lama" id="cur-pw" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Password Baru *</label>
              <PasswordField value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Buat password baru" id="new-pw" />
              {newPw && (
                <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1">
                  {rules.map(r => (
                    <div key={r.label} className="flex items-center gap-1.5 text-xs transition-all duration-200" style={{ color: r.ok ? '#34d399' : '#64748b' }}>
                      <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-all duration-200"
                        style={r.ok ? { background: 'rgba(52, 211, 153, 0.2)', border: '1px solid rgba(52, 211, 153, 0.4)' } : { background: 'rgba(100, 116, 139, 0.15)', border: '1px solid rgba(100, 116, 139, 0.2)' }}>
                        {r.ok && <CheckCircle size={8} />}
                      </div>
                      {r.label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Konfirmasi Password Baru *</label>
              <PasswordField value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Ulangi password baru" id="confirm-pw" />
              {confirmPw && !passwordsMatch && (
                <p className="mt-1.5 text-xs flex items-center gap-1" style={{ color: '#f87171' }}>
                  <AlertTriangle size={11} /> Password tidak cocok
                </p>
              )}
            </div>

            <div className="flex gap-3 justify-end pt-3">
              <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? 'Menyimpan...' : 'Ganti Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
