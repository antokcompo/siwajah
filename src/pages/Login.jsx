import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Lock, Mail, ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      let msg = err.message
      if (msg === 'Invalid login credentials') {
        msg = 'Email atau password salah'
      } else if (msg?.includes('Database error querying schema') || msg?.includes('Database error')) {
        msg = 'Gagal login. Email mungkin terdaftar sebagai OAuth/Google di Supabase'
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#060b18' }}>
      {/* Left panel - futuristic branding */}
      <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #060b18, #0c1220, #0a1628)' }}>
        {/* Animated gradient orbs */}
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full -translate-y-1/4 translate-x-1/4" style={{ background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)', animation: 'float 20s ease-in-out infinite' }} />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full translate-y-1/4 -translate-x-1/4" style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)', animation: 'float 25s ease-in-out infinite reverse' }} />
          <div className="absolute top-1/2 left-1/2 w-[400px] h-[400px] rounded-full -translate-x-1/2 -translate-y-1/2" style={{ background: 'radial-gradient(circle, rgba(59, 130, 246, 0.06) 0%, transparent 70%)', animation: 'float 15s ease-in-out infinite' }} />
        </div>

        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        <div className="relative z-10 flex flex-col justify-center px-16" style={{ animation: 'page-enter 0.6s ease-out' }}>
          <img src="/logo-pp-icon.png" alt="PT PP" className="w-24 h-24 object-contain mb-8" style={{ filter: 'grayscale(1) contrast(9) invert(1)', mixBlendMode: 'screen' }} />
          <h1 className="text-5xl font-bold leading-tight mb-4">
            <span style={{ background: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SI Wajah</span><br />
            <span style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Absensi & Aktifitas Harian</span>
          </h1>
          <p className="text-lg leading-relaxed max-w-md" style={{ color: '#64748b' }}>
            Sistem informasi web untuk mengelola absensi dan aktifitas harian pekerja proyek konstruksi secara efisien dan akurat.
          </p>
          <div className="mt-14 flex items-center gap-10">
            {[
              { value: '24/7', label: 'Monitoring' },
              { value: 'Real-time', label: 'Data Sync' },
              { value: 'Aman', label: 'Terenkripsi' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-10">
                {i > 0 && <div className="w-px h-12" style={{ background: 'linear-gradient(180deg, transparent, rgba(59, 130, 246, 0.3), transparent)' }} />}
                <div className="text-center">
                  <div className="text-xl font-bold text-white">{item.value}</div>
                  <div className="text-xs mt-1.5" style={{ color: '#475569' }}>{item.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - glass login form */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {/* Background effects */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.03) 0%, transparent 70%)' }} />

        <div className="w-full max-w-[420px] relative z-10" style={{ animation: 'page-enter 0.5s ease-out' }}>
          {/* Mobile branding */}
          <div className="lg:hidden text-center mb-10">
            <img src="/logo-pp-icon.png" alt="PT PP" className="w-16 h-16 mx-auto mb-4" style={{ filter: 'grayscale(1) contrast(9) invert(1)', mixBlendMode: 'screen' }} />
            <h1 className="text-2xl font-bold" style={{ background: 'linear-gradient(135deg, #f1f5f9, #cbd5e1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>SI Wajah</h1>
            <p className="text-sm mt-1" style={{ color: '#64748b' }}>Absensi & Aktifitas Harian</p>
          </div>

          <div className="rounded-2xl p-8" style={{ background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4), 0 0 80px rgba(59, 130, 246, 0.05)' }}>
            <div className="mb-8">
              <h2 className="text-xl font-bold text-white">Masuk</h2>
              <p className="text-sm mt-1" style={{ color: '#64748b' }}>Masukkan kredensial untuk mengakses sistem</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="text-sm p-3.5 rounded-xl flex items-start gap-2.5 animate-fade-in" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#94a3b8' }}>Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#475569' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="input-field pl-10"
                    placeholder="email@contoh.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: '#94a3b8' }}>Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#475569' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="input-field pl-10 pr-10"
                    placeholder="Masukkan password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-400 transition-colors p-1 rounded-lg flex items-center justify-center"
                    title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full justify-center py-3 text-sm inline-flex items-center gap-2 rounded-xl font-semibold text-white transition-all duration-200 active:scale-[0.97] disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #06b6d4, #3b82f6, #8b5cf6)', boxShadow: '0 4px 20px rgba(59, 130, 246, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.15)' }}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Masuk <ArrowRight size={16} /></>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs mt-6" style={{ color: '#334155' }}>
            PT PP (Persero) Tbk — SI Wajah v1.0
          </p>
        </div>
      </div>
    </div>
  )
}
