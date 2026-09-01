import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Clock, Plus, Save, Trash2 } from 'lucide-react'
import { getActiveProject } from './PilihProyek'

const jenisOptions = [
  { value: 'masuk', label: 'Masuk', color: 'bg-emerald-500' },
  { value: 'progress', label: 'Progress', color: 'bg-blue-500' },
  { value: 'istirahat', label: 'Istirahat', color: 'bg-slate-500' },
  { value: 'pulang', label: 'Pulang', color: 'bg-amber-500' },
  { value: 'lembur', label: 'Lembur', color: 'bg-red-500' },
  { value: 'pulang_lembur', label: 'Pulang Lembur', color: 'bg-purple-500' },
]

const DEFAULT_STANDARD_SLOTS = {
  REGULER: [
    { jam: '08:00', label: 'Pagi', jenis: 'masuk', toleransi_menit: 15, wajib: true, urutan: 1, aktif: true, kategori_shift: 'REGULER' },
    { jam: '10:00', label: 'Progress 1', jenis: 'progress', toleransi_menit: 10, wajib: true, urutan: 2, aktif: true, kategori_shift: 'REGULER' },
    { jam: '11:30', label: 'Siang', jenis: 'istirahat', toleransi_menit: 20, wajib: true, urutan: 3, aktif: true, kategori_shift: 'REGULER' },
    { jam: '13:00', label: 'Siang', jenis: 'progress', toleransi_menit: 15, wajib: true, urutan: 4, aktif: true, kategori_shift: 'REGULER' },
    { jam: '15:00', label: 'Progress 2', jenis: 'progress', toleransi_menit: 15, wajib: true, urutan: 5, aktif: true, kategori_shift: 'REGULER' },
    { jam: '17:00', label: 'Pulang', jenis: 'pulang', toleransi_menit: 15, wajib: true, urutan: 6, aktif: true, kategori_shift: 'REGULER' },
    { jam: '19:00', label: 'Lembur', jenis: 'lembur', toleransi_menit: 15, wajib: true, urutan: 7, aktif: true, kategori_shift: 'REGULER' },
    { jam: '00:00', label: 'Pulang lembur', jenis: 'pulang_lembur', toleransi_menit: 15, wajib: true, urutan: 8, aktif: true, kategori_shift: 'REGULER' },
  ],
  SECURITY_PAGI: [
    { jam: '06:00', label: 'Security Masuk Pagi', jenis: 'masuk', toleransi_menit: 15, wajib: true, urutan: 101, aktif: true, kategori_shift: 'SECURITY_PAGI' },
    { jam: '08:00', label: 'Security Patroli 1', jenis: 'progress', toleransi_menit: 15, wajib: true, urutan: 102, aktif: true, kategori_shift: 'SECURITY_PAGI' },
    { jam: '10:00', label: 'Security Patroli 2', jenis: 'progress', toleransi_menit: 15, wajib: true, urutan: 103, aktif: true, kategori_shift: 'SECURITY_PAGI' },
    { jam: '11:30', label: 'Security Istirahat', jenis: 'istirahat', toleransi_menit: 20, wajib: true, urutan: 104, aktif: true, kategori_shift: 'SECURITY_PAGI' },
    { jam: '13:00', label: 'Security Patroli 3', jenis: 'progress', toleransi_menit: 15, wajib: true, urutan: 105, aktif: true, kategori_shift: 'SECURITY_PAGI' },
    { jam: '15:00', label: 'Security Patroli 4', jenis: 'progress', toleransi_menit: 15, wajib: true, urutan: 106, aktif: true, kategori_shift: 'SECURITY_PAGI' },
    { jam: '17:00', label: 'Security Pulang Pagi', jenis: 'pulang', toleransi_menit: 30, wajib: true, urutan: 107, aktif: true, kategori_shift: 'SECURITY_PAGI' },
  ],
  SECURITY_MALAM: [
    { jam: '17:00', label: 'Security Masuk Malam', jenis: 'masuk', toleransi_menit: 15, wajib: true, urutan: 201, aktif: true, kategori_shift: 'SECURITY_MALAM' },
    { jam: '19:00', label: 'Security Patroli Malam 1', jenis: 'progress', toleransi_menit: 15, wajib: true, urutan: 202, aktif: true, kategori_shift: 'SECURITY_MALAM' },
    { jam: '23:00', label: 'Security Patroli Malam 2', jenis: 'progress', toleransi_menit: 15, wajib: true, urutan: 203, aktif: true, kategori_shift: 'SECURITY_MALAM' },
    { jam: '01:00', label: 'Security Patroli Subuh 1 (+1)', jenis: 'progress', toleransi_menit: 15, wajib: true, urutan: 204, aktif: true, kategori_shift: 'SECURITY_MALAM' },
    { jam: '03:00', label: 'Security Patroli Subuh 2 (+1)', jenis: 'progress', toleransi_menit: 15, wajib: true, urutan: 205, aktif: true, kategori_shift: 'SECURITY_MALAM' },
    { jam: '06:00', label: 'Security Pulang Malam (+1)', jenis: 'pulang', toleransi_menit: 30, wajib: true, urutan: 206, aktif: true, kategori_shift: 'SECURITY_MALAM' },
  ]
}

export default function JadwalSlot() {
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('REGULER') // REGULER | SECURITY_PAGI | SECURITY_MALAM

  useEffect(() => {
    loadSlots()
  }, [])

  function normalizeShiftCategory(slot) {
    let cat = slot.kategori_shift
    const lbl = (slot.label || '').toLowerCase()
    const jamStr = (slot.jam || '').slice(0, 5)

    if (cat === 'SECURITY_PAGI' || cat === 'SECURITY_MALAM' || cat === 'REGULER') {
      return cat
    }

    if (lbl.includes('malam') || lbl.includes('subuh') || jamStr === '01:00' || jamStr === '03:00') {
      return 'SECURITY_MALAM'
    }
    if (lbl.includes('security') || lbl.includes('patroli')) {
      return 'SECURITY_PAGI'
    }
    return 'REGULER'
  }

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

      let rawDb = []
      if (!error && data && data.length > 0) {
        rawDb = data
      } else {
        const { data: fallbackData } = await supabase
          .from('absen_jadwal_slot')
          .select('*')
          .order('urutan', { ascending: true })
        rawDb = fallbackData || []
      }

      // Group DB items by category
      const categories = ['REGULER', 'SECURITY_PAGI', 'SECURITY_MALAM']
      const merged = []

      for (const cat of categories) {
        const catSlots = rawDb
          .filter(s => normalizeShiftCategory(s) === cat)
          .filter(s => s.aktif !== false)

        if (catSlots.length > 0) {
          // Deduplicate by jam & label
          const seen = new Set()
          for (const s of catSlots) {
            const key = `${s.jam?.slice(0, 5)}-${s.label}`
            if (!seen.has(key)) {
              seen.add(key)
              merged.push({
                ...s,
                _uid: s.id ? String(s.id) : `temp-${cat}-${key}`,
                kategori_shift: cat,
                aktif: s.aktif !== false
              })
            }
          }
        } else {
          // Use standard defaults if category is empty
          const defaults = DEFAULT_STANDARD_SLOTS[cat] || []
          for (const s of defaults) {
            merged.push({
              ...s,
              _uid: `temp-${cat}-${s.jam}-${s.label}`,
              kode_proyek: activeKode,
              aktif: true
            })
          }
        }
      }

      setSlots(merged)
    } catch (err) {
      console.error('Error loading slots:', err)
    } finally {
      setLoading(false)
    }
  }

  function addSlot() {
    const newUid = `temp-new-${Date.now()}`
    const newSlot = {
      _uid: newUid,
      id: null,
      jam: '08:00',
      label: '',
      jenis: 'progress',
      toleransi_menit: 15,
      wajib: true,
      urutan: slots.filter(s => s.kategori_shift === activeTab).length + 1,
      aktif: true,
      kategori_shift: activeTab
    }
    setSlots(prev => [...prev, newSlot])
  }

  function updateSlot(uid, field, value) {
    setSlots(prev => prev.map(s => s._uid === uid ? { ...s, [field]: value } : s))
  }

  function removeSlot(uid) {
    setSlots(prev => prev.filter(s => s._uid !== uid))
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    try {
      const payload = slots.map((s, i) => ({
        id: (s.id && !String(s.id).startsWith('temp-')) ? s.id : null,
        jam: s.jam?.slice(0, 5) || '08:00',
        label: s.label || 'Slot',
        jenis: s.jenis || 'progress',
        toleransi_menit: Number(s.toleransi_menit) || 15,
        wajib: Boolean(s.wajib),
        urutan: Number(s.urutan) || (i + 1),
        aktif: s.aktif !== false,
        kategori_shift: s.kategori_shift || 'REGULER',
        kode_proyek: activeKode
      }))

      // 1. Fast single RPC call
      const { error: rpcErr } = await supabase.rpc('absen_save_jadwal_slot', {
        p_data: payload,
        p_kode_proyek: activeKode
      })

      // 2. Parallel fallback if RPC encounters issue
      if (rpcErr) {
        console.warn('RPC note:', rpcErr.message, '- using fast parallel upsert')
        await Promise.all(
          payload.map(item => {
            if (item.id) {
              return supabase
                .from('absen_jadwal_slot')
                .update({
                  jam: item.jam,
                  label: item.label,
                  jenis: item.jenis,
                  toleransi_menit: item.toleransi_menit,
                  wajib: item.wajib,
                  urutan: item.urutan,
                  aktif: item.aktif,
                  kategori_shift: item.kategori_shift,
                  kode_proyek: activeKode
                })
                .eq('id', item.id)
            } else {
              return supabase
                .from('absen_jadwal_slot')
                .insert({
                  jam: item.jam,
                  label: item.label,
                  jenis: item.jenis,
                  toleransi_menit: item.toleransi_menit,
                  wajib: item.wajib,
                  urutan: item.urutan,
                  aktif: item.aktif,
                  kategori_shift: item.kategori_shift,
                  kode_proyek: activeKode
                })
            }
          })
        )
      }

      setMessage(`Jadwal slot berhasil disimpan untuk proyek ${activeProj?.nama_singkat || activeKode}`)
      await loadSlots()
    } catch (err) {
      setMessage('Gagal: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const activeTabSlots = useMemo(() => {
    return slots.filter(s => s.kategori_shift === activeTab && s.aktif !== false)
  }, [slots, activeTab])

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
                  {activeTabSlots.map((slot, i) => {
                    return (
                      <tr key={slot._uid} className="hover:bg-white/5 transition-colors">
                        <td className="text-center px-3 py-3 text-slate-500">{i + 1}</td>
                        <td className="px-4 py-3">
                          <input
                            type="time"
                            value={slot.jam?.slice(0, 5) || ''}
                            onChange={e => updateSlot(slot._uid, 'jam', e.target.value)}
                            className="input-field py-1.5 w-28"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={slot.label || ''}
                            onChange={e => updateSlot(slot._uid, 'label', e.target.value)}
                            placeholder="Nama slot..."
                            className="input-field py-1.5"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={slot.jenis || 'progress'}
                            onChange={e => updateSlot(slot._uid, 'jenis', e.target.value)}
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
                            value={slot.toleransi_menit ?? 15}
                            onChange={e => updateSlot(slot._uid, 'toleransi_menit', Number(e.target.value))}
                            className="input-field py-1.5 w-20 text-center mx-auto"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(slot.wajib)}
                            onChange={e => updateSlot(slot._uid, 'wajib', e.target.checked)}
                            className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-blue-500 bg-white/5"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => removeSlot(slot._uid)}
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
