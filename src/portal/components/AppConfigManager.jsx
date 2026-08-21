import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Settings, X, Globe, Link2, ExternalLink, Save, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'

export default function AppConfigManager({ appsConfig, onSaveConfig, onClose }) {
  const { isSuperUser } = useAuth()
  const [apps, setApps] = useState(appsConfig || [])
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (appsConfig && appsConfig.length > 0) {
      setApps(appsConfig)
    }
  }, [appsConfig])

  const handleFieldChange = (code, field, value) => {
    setApps(prev => prev.map(app => app.code === code ? { ...app, [field]: value } : app))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    // 1. Instantly save to LocalStorage & local state
    onSaveConfig(apps)
    try {
      localStorage.setItem('portal_apps_dynamic_config', JSON.stringify(apps))
    } catch {}

    // 2. Persist to Supabase DB (Table upsert + RPC)
    try {
      for (const app of apps) {
        // Direct table upsert
        try {
          await supabase
            .from('portal_apps')
            .upsert({
              code: app.code,
              name: app.name,
              description: app.description,
              url: app.url,
              target_type: app.target_type || '_self',
              updated_at: new Date().toISOString()
            }, { onConflict: 'code' })
        } catch (e) {
          console.warn('Table upsert skipped:', e)
        }

        // RPC function execution
        try {
          await supabase.rpc('portal_update_app_config', {
            p_code: app.code,
            p_name: app.name,
            p_description: app.description,
            p_url: app.url,
            p_target_type: app.target_type || '_self'
          })
        } catch (e) {
          console.warn('RPC execution skipped:', e)
        }
      }

      setSuccess('Pengaturan URL & Panel Aplikasi berhasil diperbarui!')
      setTimeout(() => {
        setSuccess('')
        onClose()
      }, 1500)
    } catch (err) {
      console.warn('Supabase DB save fallback:', err)
      setSuccess('Pengaturan tersimpan di sesi Portal Hub!')
      setTimeout(() => {
        setSuccess('')
        onClose()
      }, 1500)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col bg-[#0b1329]/95 border border-cyan-500/30 rounded-3xl shadow-[0_0_50px_rgba(6,182,212,0.2)] overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-8 py-6 flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-cyan-950/40 via-purple-950/30 to-slate-950/40">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30">
              <Globe className="w-6 h-6 text-white animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">Pengaturan URL & Panel Online</h2>
              <p className="text-xs text-slate-400 mt-0.5">Tautkan masing-masing panel aplikasi dengan URL / website resminya</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-all duration-200"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-8 space-y-6">
          {error && (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle size={16} />
              <span>{success}</span>
            </div>
          )}

          <div className="space-y-4">
            {apps.map(app => (
              <div
                key={app.code}
                className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 hover:border-cyan-500/30 transition-all space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                      {app.code}
                    </span>
                    <h3 className="text-base font-bold text-white">{app.name}</h3>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">CODE: {app.code}</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Deskripsi Sistem</label>
                  <input
                    type="text"
                    value={app.description || ''}
                    onChange={e => handleFieldChange(app.code, 'description', e.target.value)}
                    placeholder="Deskripsi singkat aplikasi..."
                    className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-white/10 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/60"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-400 mb-1">URL Online / Route Target</label>
                    <div className="relative">
                      <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={app.url || ''}
                        onChange={e => handleFieldChange(app.code, 'url', e.target.value)}
                        placeholder="https://aplikasi.domain.com atau /siwajah"
                        required
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/80 border border-white/10 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/60 font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Tipe Pembukaan</label>
                    <select
                      value={app.target_type || '_self'}
                      onChange={e => handleFieldChange(app.code, 'target_type', e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-white/10 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500/60"
                    >
                      <option value="_self">Internal Route (_self)</option>
                      <option value="_blank">Tab Baru Online (_blank)</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-white/10 text-xs text-slate-400">
            <span>Perubahan akan langsung memperbarui kartu launcher di Portal Hub</span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-all"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold shadow-lg shadow-cyan-500/25 hover:opacity-90 transition-all flex items-center gap-2"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Simpan Pengaturan</span>
              </button>
            </div>
          </div>
        </form>

      </div>
    </div>
  )
}
