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
      className="user-input text-center text-lg tracking-[0.5em] font-mono bg-slate-950 text-white border-slate-700"
      autoComplete="off"
    />
  )
}

export default function UserProfil() {
  const { karyawan, logout, outdoorMode } = useUserAuth()
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
    <div className={`px-4 py-6 min-h-screen transition-colors ${outdoorMode ? 'bg-slate-950 text-white' : ''}`}>
      {/* Avatar & name */}
      <div className={`text-center mb-6 p-5 rounded-3xl border transition-all ${
        outdoorMode
          ? 'bg-slate-900 border-2 border-cyan-400 shadow-xl shadow-cyan-950/60'
          : 'bg-slate-900/60 border border-slate-800'
      }`}>
        <div className="w-20 h-20 rounded-full bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center mx-auto mb-3 shadow-md">
          <HardHat size={36} className="text-cyan-300" />
        </div>
        <h2 className="text-xl font-black text-white">{karyawan?.nama}</h2>
        <p className="text-xs font-bold text-cyan-300 mt-0.5">{karyawan?.jabatan || 'Karyawan Proyek'}</p>
      </div>

      {/* Face status card */}
      <div className="space-y-3 mb-6">
        <div className={`rounded-2xl p-4 border transition-all ${
          outdoorMode
            ? 'bg-slate-900 border-2 border-cyan-400/80 shadow-lg'
            : 'bg-slate-900/60 border border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-extrabold text-white">Data Wajah Presensi</p>
              {hasFace ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <CheckCircle size={14} className="text-emerald-400" />
                  <span className="text-xs font-black text-emerald-300">Terdaftar Presensi</span>
                  <span className="text-xs text-slate-300 font-medium ml-1">• {faceDate}</span>
                </div>
              ) : (
                <p className="text-xs font-extrabold text-rose-400 mt-1">Belum terdaftar</p>
              )}
            </div>
            <button
              onClick={() => navigate('/user/daftar-wajah')}
              className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition-all shadow-md"
            >
              {hasFace ? <><RefreshCw size={14} /> Perbarui</> : <><Camera size={14} /> Daftar</>}
            </button>
          </div>
        </div>
      </div>

      {/* Employee Info Card */}
      <div className={`rounded-2xl p-4 space-y-3.5 mb-6 border transition-all ${
        outdoorMode
          ? 'bg-slate-900 border-2 border-cyan-400/80 shadow-lg'
          : 'bg-slate-900/60 border border-slate-800'
      }`}>
        <h3 className="text-xs font-black text-cyan-300 uppercase tracking-wider">Informasi Karyawan</h3>
        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
          <span className="text-xs font-bold text-slate-300">Nama Lengkap</span>
          <span className="text-sm font-black text-white">{karyawan?.nama}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-slate-300">Jabatan Proyek</span>
          <span className="text-sm font-black text-cyan-300">{karyawan?.jabatan || '-'}</span>
        </div>
      </div>

      {/* PIN Security Form Card */}
      <div className={`rounded-2xl p-4 mb-6 border transition-all ${
        outdoorMode
          ? 'bg-slate-900 border-2 border-cyan-400/80 shadow-lg'
          : 'bg-slate-900/60 border border-slate-800'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-cyan-400" />
            <span className="text-sm font-extrabold text-white">PIN Keamanan App</span>
          </div>
          {!showPinForm && (
            <button
              onClick={() => { setShowPinForm(true); setPinError(''); setPinSuccess(false) }}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-extrabold text-xs flex items-center gap-1.5 transition-all"
            >
              <KeyRound size={14} /> Ubah PIN
            </button>
          )}
        </div>

        {showPinForm && (
          <form onSubmit={handleUbahPin} className="mt-4 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-200 block mb-1.5">PIN Lama</label>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                >
                  {showPinLama ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-200 block mb-1.5">PIN Baru (4 Digit)</label>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                >
                  {showPinBaru ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-200 block mb-1.5">Konfirmasi PIN Baru</label>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                >
                  {showPinKonfirmasi ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {pinError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-xs font-extrabold text-rose-300">
                <AlertTriangle size={16} className="shrink-0 text-rose-400" />
                <span>{pinError}</span>
              </div>
            )}

            {pinSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-xs font-extrabold text-emerald-300">
                <CheckCircle size={16} className="shrink-0 text-emerald-400" />
                <span>PIN berhasil diperbarui!</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPinForm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={pinSubmitting}
                className="px-5 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black rounded-xl text-xs transition-all shadow-md"
              >
                {pinSubmitting ? 'Menyimpan...' : 'Simpan PIN Baru'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Logout button */}
      <button
        onClick={handleLogout}
        className="w-full py-3.5 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md"
      >
        <LogOut size={18} /> Keluar Aplikasi
      </button>
    </div>
  )
}
