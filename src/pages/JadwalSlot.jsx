import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Clock, Plus, Save, Trash2, GripVertical } from 'lucide-react'
import { getActiveProject } from './PilihProyek'

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
  const [activeTab, setActiveTab] = useState('REGULER') // REGULER | SECURITY_PAGI | SECURITY_MALAM

  useEffect(() => { loadSlots() }, [])

  async function loadSlots() {
    setLoading(true)
    try {
      const activeProj = getActiveProject()
      const activeKode = activeProj?.kode || '524006'

      const { data, error } = await supabase
        .from('absen_jadwal_slot')
        .select('*')
        .eq('kode_proyek', activeKode)
        .order('urutan', { ascending: true })

      if (error) {
        const { data: fallbackData } = await supabase
          .from('absen_jadwal_slot')
          .select('*')
          .order('urutan', { ascending: true })
        setSlots(fallbackData || [])
      } else if (data && data.length > 0) {
        setSlots(data)
      } else {
        const { data: fallbackData } = await supabase
          .from('absen_jadwal_slot')
          .select('*')
          .order('urutan', { ascending: true })
        setSlots(fallbackData || [])
      }
    } catch (err) {
      console.error('Error loading slots:', err)
    } finally {
      setLoading(false)
    }
  }

  function addSlot() {
    setSlots([...slots, { ...emptySlot, urutan: slots.length + 1, kategori_shift: activeTab }])
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
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    try {
      const payload = slots.map((s, i) => {
        const isUuid = s.id && typeof s.id === 'string' && s.id.includes('-') && s.id.length >= 32
        return {
          ...s,
          id: isUuid ? s.id : null,
          kode_proyek: activeKode,
          kategori_shift: s.kategori_shift || 'REGULER',
          urutan: i + 1,
        }
      })
      const { error } = await supabase.rpc('absen_save_jadwal_slot', { p_data: payload, p_kode_proyek: activeKode })
      if (error) throw error
      setMessage(`Jadwal slot berhasil disimpan untuk proyek ${activeProj?.nama_singkat || activeKode}`)
      await loadSlots()
    } catch (err) {
      setMessage('Gagal: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredSlots = useMemo(() => {
    return slots.filter(s => {
      const cat = s.kategori_shift || 'REGULER'
      if (activeTab === 'REGULER') return cat === 'REGULER' || !cat
      return cat === activeTab
    })
  }, [slots, activeTab])

  const activeSlots = filteredSlots.filter(s => s.aktif !== false)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Jadwal Slot Absen</h1>
          <p className="text-gray-500 text-xs mt-0.5">Atur jadwal dan toleransi scan harian per kelompok shift</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          {saving ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : <Save size={16} />}
          Simpan
        </button>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setActiveTab('REGULER')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
            activeTab === 'REGULER'
              ? 'bg-blue-600 text-white border-blue-500 shadow-md'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
          }`}
        >
          Reguler Kantor
        </button>
        <button
          onClick={() => setActiveTab('SECURITY_PAGI')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
            activeTab === 'SECURITY_PAGI'
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
          }`}
        >
          Security Shift Pagi (7 Slot)
        </button>
        <button
          onClick={() => setActiveTab('SECURITY_MALAM')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
            activeTab === 'SECURITY_MALAM'
              ? 'bg-purple-600 text-white border-purple-500 shadow-md'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
          }`}
        >
          Security Shift Malam (6 Slot)
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
            <Clock size={18} className="text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-400 space-y-1.5">
              <p className="font-semibold text-slate-200">Cara Kerja Toleransi & Slot Pulang Lembur</p>
              <p>• <strong>Slot Reguler / Masuk / Pulang:</strong> Jika jam slot = <strong className="text-slate-200">10:00</strong> dan toleransi = <strong className="text-slate-200">10 menit</strong>, maka user bisa scan antara <strong className="text-slate-200">09:50 — 10:10</strong>.</p>
              <p>• <strong>Slot Pulang Lembur (Batas Maksimal):</strong> Jam slot + toleransi menit adalah <strong>BATAS MAKSIMAL AKHIR</strong> absen pulang lembur. Contoh: Jam <strong className="text-slate-200">00:00</strong> dengan toleransi <strong className="text-slate-200">30 menit</strong> berarti karyawan dapat absen pulang lembur kapan saja sejak jam lembur dimulai hingga MAKSIMAL pukul <strong className="text-cyan-300 font-mono">00:30</strong>.</p>
              <p className="text-xs text-slate-500 pt-1">Slot lembur dan pulang lembur bersifat opsional (tidak wajib).</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
