import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff, Layers, ShieldCheck, Sparkles } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'SI WAJAH - Login Admin System'
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/portal')
    } catch (err) {
      console.error('Login error:', err)
      setError(err.message || 'Gagal login. Periksa email dan password Anda.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#060913] text-slate-100 font-sans selection:bg-cyan-500 selection:text-white relative overflow-hidden">
      
      {/* Background Orbs */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[140px] animate-pulse" />
        <div className="absolute top-1/2 -right-40 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[160px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:32px_32px] opacity-20" />
      </div>

      {/* Left panel - SI WAJAH Admin System Branding */}
      <div className="hidden lg:flex lg:w-[50%] relative z-10 p-16 flex-col justify-between border-r border-white/10 bg-slate-950/40 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/30">
            <Layers className="w-6 h-6 text-cyan-200" />
          </div>
          <div>
            <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-300 tracking-wider">
              SI WAJAH ADMIN
            </h2>
            <p className="text-xs text-slate-400 font-medium">Sistem Informasi Web Absensi & Aktifitas Harian</p>
          </div>
        </div>

        <div className="my-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Portal Manajemen & Sistem Admin</span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-black leading-tight text-white tracking-tight">
            Sistem Informasi Admin<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400">
              Absensi & Aktifitas Wajah
            </span>
          </h1>

          <p className="text-sm text-slate-400 leading-relaxed max-w-md">
            Portal terpusat untuk Manajemen Master Karyawan, Rekap Presensi Harian, Rekap Gaji Bulanan, Approval Lembur, dan Laporan Izin.
          </p>

          <div className="pt-4 flex flex-wrap gap-2">
            {[
              { name: 'Rekap Harian', color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' },
              { name: 'Gaji Bulanan', color: 'border-blue-500/40 bg-blue-500/10 text-blue-300' },
              { name: 'Approval Lembur', color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
              { name: 'Master Karyawan', color: 'border-slate-700 bg-slate-800/60 text-slate-300' },
            ].map(app => (
              <span key={app.name} className={`px-3 py-1 rounded-xl text-xs font-bold border ${app.color}`}>
                {app.name}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-8 text-xs text-slate-400 border-t border-white/10 pt-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>Encrypted Admin OAuth2</span>
          </div>
          <div>
            Status Server: <span className="text-emerald-400 font-semibold">Online (Active)</span>
          </div>
        </div>
      </div>

      {/* Right panel - SI WAJAH Admin Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-[420px]">
          
          {/* Mobile Admin Branding */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/30 mb-3">
              <Layers className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
              SI WAJAH ADMIN
            </h1>
            <p className="text-xs text-slate-400 mt-1">Sistem Informasi Web Absensi & Aktifitas Harian</p>
          </div>

          <div className="glass-portal-card p-8 bg-slate-900/60 backdrop-blur-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-3xl">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white tracking-wide">Login Admin SI WAJAH</h2>
              <p className="text-xs text-slate-400 mt-1.5">Masukkan kredensial akun Admin / Atasan Anda</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="text-xs p-3.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 flex items-start gap-2.5 animate-fade-in">
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Email Akun Portal</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="email@perusahaan.com"
                    required
                    className="w-full pl-10 pr-4 py-3 bg-slate-950/80 border border-white/10 rounded-xl text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/60 transition-all duration-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Masukkan password"
                    required
                    className="w-full pl-10 pr-11 py-3 bg-slate-950/80 border border-white/10 rounded-xl text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/60 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-cyan-400 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 hover:opacity-95 hover:shadow-cyan-500/40 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2 group disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Masuk ke Portal</span>
                    <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-white/10 text-center">
              <p className="text-[11px] text-slate-500">
                Enterprise Portal SSO v2.0 &bull; PT PP (Persero) Tbk
              </p>
            </div>
          </div>

        </div>
      </div>

    </div>
  )
}
