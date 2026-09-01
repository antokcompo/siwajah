import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Clock, Plus, Save, Trash2, RotateCcw } from 'lucide-react'
import { getActiveProject } from './PilihProyek'

const jenisOptions = [
  { value: 'masuk', label: 'Masuk', color: 'bg-emerald-500' },
  { value: 'progress', label: 'Progress', color: 'bg-blue-500' },
  { value: 'istirahat', label: 'Istirahat', color: 'bg-slate-500' },
  { value: 'pulang', label: 'Pulang', color: 'bg-amber-500' },
  { value: 'lembur', label: 'Lembur', color: 'bg-red-500' },
  { value: 'pulang_lembur', label: 'Pulang Lembur', color: 'bg-purple-500' },
]

export default function JadwalSlot() {
  const [slots, setSlots] = useState([])
  const [deletedIds, setDeletedIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [activeTab, setActiveTab] = useState('REGULER') // REGULER | SECURITY_PAGI | SECURITY_MALAM

  useEffect(() => {
    loadSlots()
  }, [])

  function normalizeShiftCategory(slot) {
    let cat = slot.kategori_shift
    if (cat === 'SECURITY_PAGI' || cat === 'SECURITY_MALAM' || cat === 'REGULER') {
      return cat
    }
    const lbl = (slot.label || '').toLowerCase()
    const jamStr = (slot.jam || '').slice(0, 5)

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
        .eq('aktif', true)
        .order('urutan', { ascending: true })

      let rawDb = []
      if (!error && data) {
        rawDb = data
      } else {
        const { data: fallbackData } = await supabase
          .from('absen_jadwal_slot')
          .select('*')
          .eq('aktif', true)
          .order('urutan', { ascending: true })
        rawDb = fallbackData || []
      }

      // Format loaded slots into state with unique _uid
      const formatted = rawDb.map((s, idx) => ({
        ...s,
        _uid: s.id ? String(s.id) : `slot-${idx}-${Date.now()}`,
        kategori_shift: normalizeShiftCategory(s),
        aktif: true
      }))

      setSlots(formatted)
      setDeletedIds([])
    } catch (err) {
      console.error('Error loading slots:', err)
    } finally {
      setLoading(false)
    }
  }

  function addSlot() {
    const currentTabCount = slots.filter(s => s.kategori_shift === activeTab).length
    const defaultJam = activeTab === 'SECURITY_MALAM' ? '17:00' : (activeTab === 'SECURITY_PAGI' ? '06:00' : '08:00')
    const newUid = `temp-new-${Date.now()}-${Math.random()}`
    const newSlot = {
      _uid: newUid,
      id: null,
      jam: defaultJam,
      label: '',
      jenis: 'masuk',
      toleransi_menit: 15,
      wajib: true,
      urutan: currentTabCount + 1,
      aktif: true,
      kategori_shift: activeTab
    }
    setSlots(prev => [...prev, newSlot])
  }

  function updateSlot(uid, field, value) {
    setSlots(prev => prev.map(s => s._uid === uid ? { ...s, [field]: value } : s))
  }

  async function removeSlot(uid) {
    const target = slots.find(s => s._uid === uid)
    if (!target) return

    // 1. Langsung hapus dari state UI
    setSlots(prev => prev.filter(s => s._uid !== uid))

    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    // 2. Langsung nonaktifkan di database jika ada ID
    if (target.id && !String(target.id).startsWith('temp-')) {
      const idStr = String(target.id)
      setDeletedIds(prev => [...prev, idStr])
      try {
        await supabase.from('absen_jadwal_slot').update({ aktif: false }).eq('id', target.id)
        await supabase.from('absen_jadwal_slot').delete().eq('id', target.id)
      } catch (err) {
        console.warn('Direct delete warning:', err)
      }
    } else {
      try {
        await supabase
          .from('absen_jadwal_slot')
          .update({ aktif: false })
          .eq('kode_proyek', activeKode)
          .eq('kategori_shift', target.kategori_shift || activeTab)
          .eq('jam', target.jam)
          .eq('label', target.label)
      } catch (err) {
        console.warn('Direct match delete warning:', err)
      }
    }
  }

  async function clearCurrentTab() {
    if (!window.confirm(`Yakin ingin mengosongkan seluruh slot pada tab ${activeTab}?`)) return
    const tabSlots = slots.filter(s => s.kategori_shift === activeTab)
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    setSlots(prev => prev.filter(s => s.kategori_shift !== activeTab))

    for (const s of tabSlots) {
      if (s.id && !String(s.id).startsWith('temp-')) {
        setDeletedIds(prev => [...prev, String(s.id)])
      }
    }

    try {
      await supabase
        .from('absen_jadwal_slot')
        .update({ aktif: false })
        .eq('kode_proyek', activeKode)
        .eq('kategori_shift', activeTab)
    } catch (err) {
      console.warn('Clear tab warning:', err)
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    try {
      // 1. Eksekusi penonaktifan ID yang dihapus
      if (deletedIds.length > 0) {
        await supabase
          .from('absen_jadwal_slot')
          .update({ aktif: false })
          .in('id', deletedIds)

        try {
          await supabase
            .from('absen_jadwal_slot')
            .delete()
            .in('id', deletedIds)
        } catch (_) {}
      }

      const payload = slots.map((s, i) => ({
        id: (s.id && !String(s.id).startsWith('temp-')) ? s.id : null,
        jam: s.jam?.slice(0, 5) || '08:00',
        label: s.label || 'Slot',
        jenis: s.jenis || 'masuk',
        toleransi_menit: Number(s.toleransi_menit) || 15,
        wajib: Boolean(s.wajib),
        urutan: Number(s.urutan) || (i + 1),
        aktif: true,
        kategori_shift: s.kategori_shift || activeTab || 'REGULER',
        kode_proyek: activeKode
      }))

      // 2. Fast RPC call
      const { error: rpcErr } = await supabase.rpc('absen_save_jadwal_slot', {
        p_data: payload,
        p_kode_proyek: activeKode,
        p_deleted_ids: deletedIds
      })

      // 3. Fallback paralel jika RPC membutuhkan fallback
      if (rpcErr) {
        console.warn('RPC note:', rpcErr.message, '- using parallel direct upsert')
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
                  aktif: true,
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
                  aktif: true,
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
        <div className="flex items-center gap-2">
          {activeTabSlots.length > 0 && (
            <button 
              onClick={clearCurrentTab} 
              disabled={saving}
              className="btn-secondary text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-1.5 text-xs px-3 py-2"
              title="Kosongkan slot tab ini"
            >
              <RotateCcw size={14} /> Kosongkan Tab
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : <Save size={16} />}
            Simpan
          </button>
        </div>
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
          Reguler Kantor ({slots.filter(s => s.kategori_shift === 'REGULER' && s.aktif !== false).length})
        </button>
        <button
          onClick={() => setActiveTab('SECURITY_PAGI')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
            activeTab === 'SECURITY_PAGI'
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
          }`}
        >
          Security Shift Pagi ({slots.filter(s => s.kategori_shift === 'SECURITY_PAGI' && s.aktif !== false).length})
        </button>
        <button
          onClick={() => setActiveTab('SECURITY_MALAM')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 border ${
            activeTab === 'SECURITY_MALAM'
              ? 'bg-purple-600 text-white border-purple-500 shadow-md'
              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
          }`}
        >
          Security Shift Malam ({slots.filter(s => s.kategori_shift === 'SECURITY_MALAM' && s.aktif !== false).length})
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
            {activeTabSlots.length === 0 ? (
              <div className="text-center py-12 px-4">
                <div className="w-12 h-12 bg-slate-800/80 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <Clock size={24} />
                </div>
                <h3 className="text-sm font-bold text-slate-200 mb-1">Belum Ada Slot Jam Absen</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5">
                  Tab ini sedang kosong. Silakan klik tombol di bawah untuk menambahkan slot jam absen baru secara manual.
                </p>
                <button onClick={addSlot} className="btn-primary inline-flex items-center gap-2 text-sm px-4 py-2">
                  <Plus size={16} /> Tambah Slot Pertama
                </button>
              </div>
            ) : (
              <>
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
                                placeholder="Nama slot (contoh: Masuk Pagi)..."
                                className="input-field py-1.5"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={slot.jenis || 'masuk'}
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
                                title="Hapus Slot"
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

                <div className="px-5 py-4 border-t border-white/5 flex items-center justify-between">
                  <button onClick={addSlot} className="btn-secondary flex items-center gap-2 text-sm">
                    <Plus size={14} /> Tambah Slot
                  </button>
                  <span className="text-xs text-slate-500">
                    Total: {activeTabSlots.length} slot aktif
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Info card */}
        <div className="card p-5 mt-6">
          <div className="flex items-start gap-3">
            <Clock size={18} className="text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-400 space-y-1.5">
              <p className="font-semibold text-slate-200">Panduan Pengaturan Slot Jam Absen</p>
              <p>• <strong>Reguler Kantor:</strong> Slot jam presensi harian untuk pekerja umum/non-security (misal: 08:00, 10:00, 11:30, 13:00, 15:00, 17:00, dan lembur 19:00).</p>
              <p>• <strong>Security Shift Pagi:</strong> Slot jam presensi khusus security shift pagi (misal: 06:00 hingga 17:00).</p>
              <p>• <strong>Security Shift Malam:</strong> Slot jam presensi khusus security shift malam (misal: 17:00 hingga 06:00 subuh).</p>
              <p className="text-xs text-slate-500 pt-1">Klik <strong>Simpan</strong> setelah selesai menambahkan atau mengubah slot.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
