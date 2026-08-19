import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Clock, Plus, Save, Trash2, GripVertical } from 'lucide-react'

const jenisOptions = [
  { value: 'masuk', label: 'Masuk', color: 'bg-emerald-500' },
  { value: 'progress', label: 'Progress', color: 'bg-blue-500' },
  { value: 'istirahat', label: 'Istirahat', color: 'bg-slate-500' },
  { value: 'pulang', label: 'Pulang', color: 'bg-amber-500' },
  { value: 'lembur', label: 'Lembur', color: 'bg-red-500' },
  { value: 'pulang_lembur', label: 'Pulang Lembur', color: 'bg-purple-500' },
]

const emptySlot = { id: null, jam: '08:00', label: '', jenis: 'progress', toleransi_menit: 15, wajib: true, urutan: 99, aktif: true }

export default function JadwalSlot() {
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { loadSlots() }, [])

  async function loadSlots() {
    setLoading(true)
    const { data } = await supabase
      .from('absen_jadwal_slot')
      .select('*')
      .order('urutan', { ascending: true })
    setSlots(data || [])
    setLoading(false)
  }

  function addSlot() {
    setSlots([...slots, { ...emptySlot, urutan: slots.length + 1 }])
  }

  function updateSlot(index, field, value) {
    const updated = [...slots]
    updated[index] = { ...updated[index], [field]: value }
    setSlots(updated)
  }

  function removeSlot(index) {
    if (slots[index].id) {
      updateSlot(index, 'aktif', false)
    } else {
      setSlots(slots.filter((_, i) => i !== index))
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      const payload = slots.map((s, i) => ({
        ...s,
        urutan: i + 1,
      }))
      const { error } = await supabase.rpc('absen_save_jadwal_slot', { p_data: payload })
      if (error) throw error
      setMessage('Jadwal berhasil disimpan')
      await loadSlots()
    } catch (err) {
      setMessage('Gagal: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const activeSlots = slots.filter(s => s.aktif !== false)
  const inactiveSlots = slots.filter(s => s.aktif === false)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Jadwal Slot Absen</h1>
          <p className="text-gray-500 text-xs mt-0.5">Atur jadwal dan toleransi scan harian</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : <Save size={16} />}
          Simpan
        </button>
      </div>

      <div className="main-content">
        {message && (
          <div className={`rounded-xl p-4 mb-4 text-sm ${
            message.startsWith('Gagal') ? 'bg-red-500/10 text-red-400 border border-red-400/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-400/20'
          }`}>{message}</div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    <th className="text-center px-3 py-3 w-12">#</th>
                    <th className="text-left px-4 py-3">Jam</th>
                    <th className="text-left px-4 py-3">Label</th>
                    <th className="text-left px-4 py-3">Jenis</th>
                    <th className="text-center px-4 py-3">Toleransi (menit)</th>
                    <th className="text-center px-4 py-3">Wajib</th>
                    <th className="text-center px-4 py-3 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {activeSlots.map((slot, i) => {
                    const realIndex = slots.indexOf(slot)
                    const jenisInfo = jenisOptions.find(j => j.value === slot.jenis)
                    return (
                      <tr key={slot.id || `new-${i}`} className="hover:bg-white/5 transition-colors">
                        <td className="text-center px-3 py-3 text-slate-500">{i + 1}</td>
                        <td className="px-4 py-3">
                          <input
                            type="time"
                            value={slot.jam?.slice(0, 5) || ''}
                            onChange={e => updateSlot(realIndex, 'jam', e.target.value)}
                            className="input-field py-1.5 w-28"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={slot.label}
                            onChange={e => updateSlot(realIndex, 'label', e.target.value)}
                            placeholder="Nama slot..."
                            className="input-field py-1.5"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={slot.jenis}
                            onChange={e => updateSlot(realIndex, 'jenis', e.target.value)}
                            className="select-field py-1.5"
                          >
                            {jenisOptions.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min={1}
                            max={120}
                            value={slot.toleransi_menit}
                            onChange={e => updateSlot(realIndex, 'toleransi_menit', Number(e.target.value))}
                            className="input-field py-1.5 w-20 text-center mx-auto"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={slot.wajib}
                            onChange={e => updateSlot(realIndex, 'wajib', e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500 bg-white/5"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => removeSlot(realIndex)}
                            className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Hapus"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-4 border-t border-white/5">
              <button onClick={addSlot} className="btn-secondary flex items-center gap-2 text-sm">
                <Plus size={14} /> Tambah Slot
              </button>
            </div>
          </div>
        )}

        {/* Info card */}
        <div className="card p-5 mt-6">
          <div className="flex items-start gap-3">
            <Clock size={18} className="text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-400">
              <p className="font-medium text-slate-300 mb-1">Cara Kerja Toleransi</p>
              <p>Jika jam slot = <strong className="text-slate-200">10:00</strong> dan toleransi = <strong className="text-slate-200">±10 menit</strong>, maka user bisa scan antara <strong className="text-slate-200">09:50 — 10:10</strong>.</p>
              <p className="mt-1">Slot lembur dan pulang lembur bersifat opsional (tidak wajib).</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
