import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth, SUPER_USER_EMAIL } from '../../contexts/AuthContext'
import { ShieldAlert, X, Search, Lock, Unlock, Crown, Sparkles } from 'lucide-react'

const APPS_LIST = [
  { code: 'siwajah', name: 'SI WAJAH', badge: 'Presensi & Wajah', color: 'from-cyan-500 to-blue-600' },
  { code: 'simontok', name: 'SIMONTOK', badge: 'Monitoring System', color: 'from-purple-500 to-pink-600' },
  { code: 'simonika', name: 'SIMONIKA', badge: 'Analytics & Tracking', color: 'from-emerald-500 to-teal-600' },
]

export default function AppAccessManager({ onClose }) {
  const { getUserAllowedApps, toggleUserAppAccess } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await supabase.rpc('absen_list_auth_users')
      if (err) {
        setError(err.message)
      } else {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data
        setUsers(parsed || [])
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    return !q || (u.email || '').toLowerCase().includes(q) || (u.nama || '').toLowerCase().includes(q)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col bg-[#0b1329]/90 border border-cyan-500/30 rounded-3xl shadow-[0_0_50px_rgba(6,182,212,0.2)] overflow-hidden">
        
        {/* Header */}
        <div className="px-8 py-6 flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-cyan-950/40 via-purple-950/30 to-slate-950/40">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-cyan-500 to-purple-600 shadow-lg shadow-cyan-500/30">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white tracking-wide">Matrix Hak Akses Aplikasi</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border border-pink-500/30 shadow-[0_0_10px_rgba(236,72,153,0.3)]">
                  Super Admin Control
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Kelola ijin masuk (App Entitlements) untuk tiap pengguna di Portal Terpusat</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-all duration-200"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Info Bar */}
        <div className="px-8 py-4 bg-slate-900/60 border-b border-white/5 flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari user berdasarkan email atau nama..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-white/10 rounded-xl text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60 transition-all duration-200"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>Klik pada badge aplikasi untuk memberi/mencabut akses secara instant</span>
          </div>
        </div>

        {/* User Table / List */}
        <div className="flex-1 overflow-y-auto p-8 space-y-3">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
              <p className="text-sm">Memuat data pengguna & hak akses...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              Tidak ada pengguna ditemukan untuk pencarian ini.
            </div>
          ) : (
            filtered.map(u => {
              const isSuper = u.email?.toLowerCase() === SUPER_USER_EMAIL.toLowerCase()
              const allowedApps = getUserAllowedApps(u.id, u.email)

              return (
                <div
                  key={u.id}
                  className={`p-4 rounded-2xl border transition-all duration-200 flex flex-wrap items-center justify-between gap-4 ${
                    isSuper
                      ? 'bg-gradient-to-r from-purple-950/30 via-slate-900/60 to-pink-950/20 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.15)]'
                      : 'bg-slate-900/40 border-white/10 hover:border-cyan-500/30 hover:bg-slate-900/70'
                  }`}
                >
                  {/* User info */}
                  <div className="flex items-center gap-3.5 min-w-[240px]">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shadow-inner ${
                      isSuper ? 'bg-gradient-to-br from-pink-500 to-purple-600 text-white' : 'bg-slate-800 text-cyan-400 border border-white/10'
                    }`}>
                      {isSuper ? <Crown className="w-5 h-5" /> : (u.nama?.[0] || u.email[0]).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{u.email}</span>
                        {isSuper && (
                          <span className="px-2 py-0.5 text-[9px] font-extrabold rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase tracking-widest">
                            SUPER USER
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{u.nama || 'User Terdaftar'}</p>
                    </div>
                  </div>

                  {/* App Permission Toggles */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {APPS_LIST.map(app => {
                      const hasAccess = isSuper || allowedApps.includes(app.code)

                      return (
                        <button
                          key={app.code}
                          disabled={isSuper}
                          onClick={() => toggleUserAppAccess(u.id, u.email, app.code)}
                          className={`group relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-200 ${
                            hasAccess
                              ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)] hover:bg-cyan-500/25 hover:border-cyan-400'
                              : 'bg-slate-950/60 border-white/10 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                          } ${isSuper ? 'cursor-default opacity-90' : 'cursor-pointer active:scale-95'}`}
                        >
                          {hasAccess ? (
                            <Unlock className="w-3.5 h-3.5 text-cyan-400" />
                          ) : (
                            <Lock className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span>{app.name}</span>
                          <span className={`w-2 h-2 rounded-full ${hasAccess ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 'bg-slate-700'}`} />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-white/10 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <div>
            Total <strong className="text-white">{filtered.length}</strong> user terdaftar dalam database
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-lg shadow-cyan-500/25 hover:opacity-90 transition-all duration-200"
          >
            Selesai
          </button>
        </div>

      </div>
    </div>
  )
}
