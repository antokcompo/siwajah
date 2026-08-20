import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { AlertTriangle, HardHat, Eye, EyeOff } from 'lucide-react'

export default function UserLogin() {
  const [noHp, setNoHp] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useUserAuth()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!noHp.trim() || !pin.trim()) {
      setError('Isi No. HP dan PIN')
      return
    }
    setLoading(true)
    setError('')
    try {
      await login(noHp.trim(), pin.trim())
      navigate('/user')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="user-login-page">
      <div className="user-login-card">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
            <HardHat size={32} className="text-cyan-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-100">SI WAJAH</h1>
          <p className="text-xs text-slate-500 mt-1">Absensi Wajah Harian</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">No. HP</label>
            <input
              type="tel"
              inputMode="numeric"
              value={noHp}
              onChange={e => setNoHp(e.target.value)}
              placeholder="08xxxxxxxxxx"
              className="user-input"
              autoComplete="tel"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">PIN</label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="****"
                className="user-input text-center text-lg tracking-[0.5em] pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-400 transition-colors p-1 rounded-lg flex items-center justify-center"
                title={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
              >
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-400/20 rounded-xl p-3">
              <AlertTriangle size={14} className="shrink-0" /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="user-btn-primary w-full"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Masuk...
              </div>
            ) : 'MASUK'}
          </button>
        </form>

        <p className="text-center text-[10px] text-slate-600 mt-6">
          Hubungi admin jika belum punya akun
        </p>
      </div>
    </div>
  )
}
