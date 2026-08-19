import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserAuth } from '../../contexts/UserAuthContext'
import { supabase } from '../../lib/supabase'
import { Camera, CheckCircle, LogOut, RefreshCw, HardHat, Eye, EyeOff, KeyRound, AlertTriangle, Lock } from 'lucide-react'

function PinInput({ value, onChange, visible, placeholder }) {
  return (
    <input
      type={visible ? 'text' : 'password'}
      inputMode="numeric"
      maxLength={4}
      pattern="\d{4}"
      value={value}
      onChange={e => {
        const v = e.target.value.replace(/\D/g, '').slice(0, 4)
        onChange(v)
      }}
      placeholder={placeholder}
      className="user-input text-center text-lg tracking-[0.5em] font-mono"
      autoComplete="off"
    />
  )
}

export default function UserProfil() {
  const { karyawan, logout } = useUserAuth()
  const navigate = useNavigate()
  const [hasFace, setHasFace] = useState(null)
  const [faceDate, setFaceDate] = useState(null)

  const [showPinForm, setShowPinForm] = useState(false)
  const [pinLama, setPinLama] = useState('')
  const [pinBaru, setPinBaru] = useState('')
  const [pinKonfirmasi, setPinKonfirmasi] = useState('')
  const [showPinLama, setShowPinLama] = useState(false)
  const [showPinBaru, setShowPinBaru] = useState(false)
  const [showPinKonfirmasi, setShowPinKonfirmasi] = useState(false)
  const [pinSubmitting, setPinSubmitting] = useState(false)
  const [pinError, setPinError] = useState('')
  const [pinSuccess, setPinSuccess] = useState(false)

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

  async function handleUbahPin(e) {
    e.preventDefault()
    setPinError('')
    setPinSuccess(false)

    if (pinLama.length !== 4) {
      setPinError('PIN lama harus 4 digit')
      return
    }
    if (pinBaru.length !== 4) {
      setPinError('PIN baru harus 4 digit')
      return
    }
    if (pinBaru !== pinKonfirmasi) {
      setPinError('Konfirmasi PIN tidak cocok')
      return
    }

    setPinSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('absen_ubah_pin', {
        p_karyawan_id: karyawan.id,
        p_pin_lama: pinLama,
        p_pin_baru: pinBaru,
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)

      setPinSuccess(true)
      setPinLama('')
      setPinBaru('')
      setPinKonfirmasi('')
      setShowPinLama(false)
      setShowPinBaru(false)
      setShowPinKonfirmasi(false)
      setTimeout(() => {
        setPinSuccess(false)
        setShowPinForm(false)
      }, 2000)
    } catch (err) {
      setPinError(err.message)
    } finally {
      setPinSubmitting(false)
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

      {/* Ubah PIN */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-slate-400" />
            <span className="text-sm font-semibold text-slate-200">PIN Keamanan</span>
          </div>
          {!showPinForm && (
            <button
              onClick={() => { setShowPinForm(true); setPinError(''); setPinSuccess(false) }}
              className="user-btn-secondary text-xs flex items-center gap-1.5 py-2 px-3"
            >
              <KeyRound size={12} /> Ubah PIN
            </button>
          )}
        </div>

        {showPinForm && (
          <form onSubmit={handleUbahPin} className="mt-4 space-y-4">
            {/* PIN Lama */}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">PIN Lama</label>
              <div className="relative">
                <PinInput
                  value={pinLama}
                  onChange={setPinLama}
                  visible={showPinLama}
                  placeholder="••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPinLama(!showPinLama)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPinLama ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* PIN Baru */}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">PIN Baru</label>
              <div className="relative">
                <PinInput
                  value={pinBaru}
                  onChange={setPinBaru}
                  visible={showPinBaru}
                  placeholder="••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPinBaru(!showPinBaru)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPinBaru ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Konfirmasi PIN */}
            <div>
              <label className="text-xs text-slate-400 block mb-1.5">Konfirmasi PIN Baru</label>
              <div className="relative">
                <PinInput
                  value={pinKonfirmasi}
                  onChange={setPinKonfirmasi}
                  visible={showPinKonfirmasi}
                  placeholder="••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPinKonfirmasi(!showPinKonfirmasi)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPinKonfirmasi ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {pinError && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 rounded-xl p-3">
                <AlertTriangle size={14} className="shrink-0" /> {pinError}
              </div>
            )}

            {pinSuccess && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-xl p-3">
                <CheckCircle size={14} className="shrink-0" /> PIN berhasil diubah
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowPinForm(false)
                  setPinLama('')
                  setPinBaru('')
                  setPinKonfirmasi('')
                  setPinError('')
                  setShowPinLama(false)
                  setShowPinBaru(false)
                  setShowPinKonfirmasi(false)
                }}
                className="user-btn-secondary flex-1 text-sm"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={pinSubmitting || pinLama.length !== 4 || pinBaru.length !== 4 || pinKonfirmasi.length !== 4}
                className="user-btn-primary flex-1 text-sm"
              >
                {pinSubmitting ? 'Menyimpan...' : 'Simpan PIN'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Logout */}
      <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors text-sm font-medium">
        <LogOut size={16} /> Keluar
      </button>
    </div>
  )
}
