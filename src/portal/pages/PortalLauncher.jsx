import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import AppAccessManager from '../components/AppAccessManager'
import AppConfigManager from '../components/AppConfigManager'
import { 
  ScanFace, 
  Activity, 
  BarChart3, 
  PlusCircle, 
  Lock, 
  Crown, 
  LogOut, 
  ShieldCheck, 
  ArrowRight, 
  Sparkles, 
  Layers, 
  Info,
  Settings,
  ExternalLink,
  Globe
} from 'lucide-react'

const DEFAULT_APPS_CONFIG = [
  {
    code: 'siwajah',
    name: 'SI WAJAH',
    badge: 'Absensi & Wajah',
    description: 'Sistem Informasi Web Absensi dan Aktifitas Harian',
    url: 'https://siwajah.pages.dev',
    target_type: '_blank',
    icon: ScanFace,
    gradient: 'from-cyan-500 to-blue-600',
    shadow: 'shadow-cyan-500/30',
    colorText: 'text-cyan-400',
    hoverText: 'group-hover:text-cyan-300',
    badgeClass: 'text-cyan-400'
  },
  {
    code: 'simontok',
    name: 'SIMONTOK',
    badge: 'Monitoring Keuangan',
    description: 'Sistem Informasi Monitoring Keuangan',
    url: 'https://simontok.domain.com',
    target_type: '_blank',
    icon: Activity,
    gradient: 'from-purple-500 to-pink-600',
    shadow: 'shadow-purple-500/30',
    colorText: 'text-purple-400',
    hoverText: 'group-hover:text-purple-300',
    badgeClass: 'text-purple-400'
  },
  {
    code: 'simonika',
    name: 'SIMONIKA',
    badge: 'Monitoring Kas',
    description: 'Sistem Informasi Monitoring Kas',
    url: 'https://simonika.domain.com',
    target_type: '_blank',
    icon: BarChart3,
    gradient: 'from-emerald-500 to-teal-600',
    shadow: 'shadow-emerald-500/30',
    colorText: 'text-emerald-400',
    hoverText: 'group-hover:text-emerald-300',
    badgeClass: 'text-emerald-400'
  }
]

const ICON_MAP = {
  siwajah: ScanFace,
  simontok: Activity,
  simonika: BarChart3
}

export default function PortalLauncher() {
  const { user, profile, isSuperUser, hasAppAccess, signOut } = useAuth()
  const navigate = useNavigate()
  const [showAccessManager, setShowAccessManager] = useState(false)
  const [showConfigManager, setShowConfigManager] = useState(false)
  const [lockedToast, setLockedToast] = useState('')

  const [appsConfig, setAppsConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('portal_apps_dynamic_config')
      return saved ? JSON.parse(saved) : DEFAULT_APPS_CONFIG
    } catch {
      return DEFAULT_APPS_CONFIG
    }
  })

  useEffect(() => {
    document.title = 'Prisma Integrated - System management'
    fetchAppsConfigFromDB()
  }, [])

  const fetchAppsConfigFromDB = async () => {
    try {
      let dbApps = null
      const { data, error } = await supabase.from('portal_apps').select('*')
      if (!error && Array.isArray(data) && data.length > 0) {
        dbApps = data
      } else {
        const rpcRes = await supabase.rpc('portal_get_apps')
        if (!rpcRes.error && Array.isArray(rpcRes.data) && rpcRes.data.length > 0) {
          dbApps = rpcRes.data
        }
      }

      if (Array.isArray(dbApps) && dbApps.length > 0) {
        setAppsConfig(prev => {
          const merged = prev.map(currentApp => {
            const dbApp = dbApps.find(a => a.code === currentApp.code)
            if (dbApp && dbApp.url) {
              return {
                ...currentApp,
                name: dbApp.name || currentApp.name,
                description: dbApp.description || currentApp.description,
                url: dbApp.url,
                target_type: dbApp.target_type || currentApp.target_type
              }
            }
            return currentApp
          })
          try { localStorage.setItem('portal_apps_dynamic_config', JSON.stringify(merged)) } catch {}
          return merged
        })
      }
    } catch (e) {
      console.warn('Fallback to local apps config:', e)
    }
  }

  const handleSaveAppsConfig = (newConfig) => {
    setAppsConfig(newConfig)
    try { localStorage.setItem('portal_apps_dynamic_config', JSON.stringify(newConfig)) } catch {}
  }

  const [verifyingApp, setVerifyingApp] = useState(null)
  const [verifiedInfo, setVerifiedInfo] = useState(null)

  const handleLaunchApp = async (app) => {
    if (!user || !user.email) {
      setLockedToast('Sesi Otentikasi Kedaluwarsa: Silakan login ulang pada Portal.')
      setTimeout(() => navigate('/login'), 2000)
      return
    }

    if (!hasAppAccess(app.code)) {
      setLockedToast(`Akses Terkunci: Pengguna ${user.email} tidak memiliki izin untuk membuka ${app.name}. Hubungi Administrator.`)
      setTimeout(() => setLockedToast(''), 4000)
      return
    }

    // Explicit User Email & Role Verification Step
    setVerifyingApp(app.name)
    
    try {
      let verifiedRole = isSuperUser ? 'admin' : (profile?.role || 'atasan')

      // Query Supabase DB to verify system-specific role for this email
      const { data: dbProfile } = await supabase
        .from('absen_user_profiles')
        .select('role, nama')
        .eq('id', user.id)
        .single()

      if (dbProfile) {
        verifiedRole = isSuperUser ? 'admin' : (dbProfile.role || verifiedRole)
      }

      setVerifiedInfo({
        email: user.email,
        role: verifiedRole.toUpperCase(),
        appName: app.name
      })

      setTimeout(() => {
        setVerifyingApp(null)
        setVerifiedInfo(null)

        if (app.target_type === '_blank' || app.url.startsWith('http')) {
          let launchUrl = app.url
          try {
            const sessionKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
            if (sessionKey) {
              const sessData = JSON.parse(localStorage.getItem(sessionKey))
              const token = sessData?.access_token
              if (token) {
                const sep = launchUrl.includes('?') ? '&' : '?'
                launchUrl = `${launchUrl}${sep}sso_token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}&role=${encodeURIComponent(verifiedRole)}`
              }
            }
          } catch {}
          window.open(launchUrl, '_blank')
        } else {
          navigate(app.url)
        }
      }, 700)
    } catch (err) {
      console.warn('Verification fallback:', err)
      setVerifyingApp(null)
      setVerifiedInfo(null)
      navigate(app.url)
    }
  }

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 relative overflow-hidden font-sans selection:bg-cyan-500 selection:text-white">
      
      {/* Background Futuristic Ambient Orbs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[150px]" />
        <div className="absolute -bottom-40 left-1/3 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:32px_32px] opacity-20" />
      </div>

      {/* Main Container */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8 flex flex-col min-h-screen">
        
        {/* Top Navbar Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-3xl bg-slate-900/40 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)] mb-12">
          {/* Logo & Portal Branding */}
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 via-blue-600 to-purple-600 shadow-[0_0_20px_rgba(6,182,212,0.4)]">
              <Layers className="w-6 h-6 text-white animate-bounce-slow" />
              <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-500 opacity-40 blur-sm -z-10" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-300">
                  PRISMA INTEGRATED
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 uppercase tracking-widest">
                  v2.0 HUB
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Project Integrated System management</p>
            </div>
          </div>

          {/* User Status & Control Bar */}
          <div className="flex items-center gap-3">
            {/* Super User Controls */}
            {isSuperUser && (
              <>
                <button
                  onClick={() => setShowConfigManager(true)}
                  className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold hover:bg-cyan-500/20 transition-all duration-200"
                  title="Tautkan URL Online Aplikasi"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Seting URL Online</span>
                </button>

                <button
                  onClick={() => setShowAccessManager(true)}
                  className="group relative flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-indigo-500/20 border border-pink-500/40 text-pink-300 text-xs font-bold shadow-[0_0_15px_rgba(236,72,153,0.25)] hover:scale-105 transition-all duration-200"
                >
                  <Crown className="w-4 h-4 text-pink-400 animate-bounce" />
                  <span>Super User</span>
                  <span className="hidden sm:inline text-[10px] bg-pink-500/30 px-1.5 py-0.5 rounded text-pink-200">
                    Kelola Akses
                  </span>
                </button>
              </>
            )}

            {/* Profile Info */}
            <div className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-slate-950/60 border border-white/10 text-xs">
              <div className="w-7 h-7 rounded-xl bg-cyan-500/20 text-cyan-300 font-bold flex items-center justify-center border border-cyan-500/30">
                {(profile?.nama?.[0] || user?.email?.[0] || 'U').toUpperCase()}
              </div>
              <div className="hidden md:block text-left">
                <div className="font-semibold text-slate-200 truncate max-w-[180px]">{profile?.nama || user?.email}</div>
                <div className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                  <ShieldCheck className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span className="truncate max-w-[160px]">{user?.email}</span>
                </div>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={signOut}
              className="p-2.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 transition-all duration-200"
              title="Keluar / Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Locked Toast Notification */}
        {lockedToast && (
          <div className="mb-6 p-4 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-300 text-sm flex items-center justify-between gap-3 shadow-[0_0_30px_rgba(239,68,68,0.25)] animate-fade-in">
            <div className="flex items-center gap-2.5">
              <Info className="w-5 h-5 text-red-400 shrink-0" />
              <span>{lockedToast}</span>
            </div>
            <button onClick={() => setLockedToast('')} className="text-xs text-red-400 hover:underline font-bold">
              Tutup
            </button>
          </div>
        )}

        {/* Hero Banner Section */}
        <section className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-4 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
            <span>Ekosistem Aplikasi Terintegrasi</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight mb-3">
            Pusat Layanan & Dashboard Aplikasi
          </h2>
          <p className="text-sm sm:text-base text-slate-400 max-w-2xl">
            Pilih aplikasi yang ingin Anda buka. Akses otomatis disesuaikan dengan izin otorisasi Single Sign-On (SSO) milik Anda.
          </p>
        </section>

        {/* Applications Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          
          {appsConfig.map(app => {
            const hasAccess = hasAppAccess(app.code)
            const Icon = ICON_MAP[app.code] || (typeof app.icon === 'function' ? app.icon : Globe)

            return (
              <div
                key={app.code}
                onClick={() => handleLaunchApp(app)}
                className={`glass-portal-card p-6 flex flex-col justify-between min-h-[260px] ${
                  hasAccess ? 'glass-portal-card-interactive group' : 'glass-portal-card-locked'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${app.gradient} flex items-center justify-center text-white ${app.shadow} group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-7 h-7" />
                    </div>
                    {hasAccess ? (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Aktif
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5" />
                        Terkunci
                      </span>
                    )}
                  </div>

                  <h3 className={`text-xl font-bold text-white mb-2 ${app.hoverText} transition-colors`}>
                    {app.name}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-4">
                    {app.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                  <span className={`text-xs font-semibold ${app.badgeClass}`}>{app.badge}</span>
                  <div className={`w-9 h-9 rounded-xl bg-white/5 group-hover:bg-cyan-500 text-slate-300 group-hover:text-white flex items-center justify-center transition-all duration-300`}>
                    {hasAccess ? (
                      app.target_type === '_blank' ? <ExternalLink className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />
                    ) : (
                      <Lock className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* CARD 4: FUTURE SYSTEM SLOT (Super User Only) */}
          {isSuperUser && (
            <div className="glass-portal-card p-6 flex flex-col justify-between min-h-[260px] border-dashed border-cyan-500/30 bg-slate-950/30">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                    <PlusCircle className="w-7 h-7 animate-pulse" />
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                    Ready Slot
                  </span>
                </div>

                <h3 className="text-xl font-bold text-slate-300 mb-2">
                  + Sistem Masa Depan
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Slot ekspansi aplikasi baru. Sistem mikro-servis tambahan dapat dipasang dengan integrasi SSO instan.
                </p>
              </div>

              <div className="pt-4 border-t border-white/5 text-xs text-slate-500 font-medium">
                Ecosystem Ready
              </div>
            </div>
          )}

        </section>

        {/* Footer info */}
        <footer className="mt-auto pt-8 border-t border-white/10 text-center sm:flex sm:items-center sm:justify-between text-xs text-slate-500">
          <div>
            &copy; 2026 Enterprise Portal Hub. Integrated Architecture.
          </div>
          <div className="mt-2 sm:mt-0 flex items-center justify-center gap-4">
            <span className="text-slate-400 font-mono text-[11px]">SSO Token: Active</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-slate-400">Gateway Status: Online</span>
          </div>
        </footer>

      </div>

      {/* Super User Access Management Modal */}
      {showAccessManager && (
        <AppAccessManager onClose={() => setShowAccessManager(false)} />
      )}

      {/* Super User App Online Link Settings Modal */}
      {showConfigManager && (
        <AppConfigManager
          appsConfig={appsConfig}
          onSaveConfig={handleSaveAppsConfig}
          onClose={() => setShowConfigManager(false)}
        />
      )}
      {/* Verification & Role Handshake Modal */}
      {verifyingApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in">
          <div className="p-8 rounded-3xl bg-slate-900/90 border border-cyan-500/40 text-center max-w-md shadow-[0_0_50px_rgba(6,182,212,0.3)] space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/40">
              <Shield className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-wide">Memverifikasi Otentikasi & Role</h3>
              <p className="text-xs text-slate-400 mt-1">Menghubungkan sesi SSO ke <span className="text-cyan-300 font-bold">{verifyingApp}</span></p>
            </div>
            {verifiedInfo && (
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/10 text-left space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>User Email:</span>
                  <span className="text-slate-200 font-semibold truncate max-w-[200px]">{verifiedInfo.email}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Verified Role:</span>
                  <span className="text-cyan-400 font-bold">{verifiedInfo.role}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 text-xs text-cyan-400 font-semibold pt-1">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Memproses Handshake Sesi...</span>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
