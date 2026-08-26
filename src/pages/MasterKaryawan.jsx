import { useEffect, useState, useMemo, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Plus, Pencil, Search, Upload, FileSpreadsheet, CheckCircle, AlertTriangle, X, Users, Eye, EyeOff, Building2, HardHat } from 'lucide-react'
import * as XLSX from 'xlsx'

function fmtRupiah(val) {
  const num = String(val).replace(/\D/g, '')
  if (!num) return ''
  return new Intl.NumberFormat('id-ID').format(Number(num))
}

function parseRupiah(formatted) {
  return formatted.replace(/\./g, '')
}

export default function MasterKaryawan() {
  const [searchParams] = useSearchParams()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(() => searchParams.get('search') || '')
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    const s = searchParams.get('search')
    if (s) setSearch(s)
  }, [searchParams])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ nama: '', jabatan: '', uid_mesin: '', gaji_bulanan: '', tunjangan: '0', tgl_masuk: '', status_aktif: true, atasan_id: '', no_hp: '', pin: '' })
  const [showPin, setShowPin] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mandorList, setMandorList] = useState([])

  const [showImport, setShowImport] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState('')

  const [showProyekModal, setShowProyekModal] = useState(false)
  const [proyekList, setProyekList] = useState([])
  const [loadingProyek, setLoadingProyek] = useState(false)
  const [savingProyek, setSavingProyek] = useState(false)
  const [proyekError, setProyekError] = useState('')
  const [proyekSuccess, setProyekSuccess] = useState('')

  const [proyekForm, setProyekForm] = useState({
    kode_proyek: '',
    nama_proyek: '',
    nama_singkat: '',
    lokasi: '',
    zona_waktu: 'Asia/Jayapura',
    tz_label: 'WIT (UTC+9)',
    status: 'AKTIF',
    deskripsi: ''
  })
  const [editingProyekKode, setEditingProyekKode] = useState(null)

  useEffect(() => { load() }, [])

  async function loadProyekList() {
    setLoadingProyek(true)
    try {
      const { data: resData, error: err } = await supabase.from('absen_proyek').select('*').order('created_at', { ascending: true })
      if (!err && resData && resData.length > 0) {
        setProyekList(resData)
      } else {
        setProyekList([
          {
            kode_proyek: '524006',
            nama_proyek: 'Proyek Portsite Accommodation Complex (524006)',
            nama_singkat: 'Portsite Accommodation Complex',
            lokasi: 'Portsite, Papua',
            zona_waktu: 'Asia/Jayapura',
            tz_label: 'WIT (UTC+9)',
            status: 'AKTIF',
            deskripsi: 'Proyek Utama Portsite Accommodation Complex (524006).'
          }
        ])
      }
    } catch {
    } finally {
      setLoadingProyek(false)
    }
  }

  function openAddProyek() {
    setEditingProyekKode(null)
    setProyekForm({
      kode_proyek: '',
      nama_proyek: '',
      nama_singkat: '',
      lokasi: '',
      zona_waktu: 'Asia/Jayapura',
      tz_label: 'WIT (UTC+9)',
      status: 'AKTIF',
      deskripsi: ''
    })
    setProyekError('')
    setProyekSuccess('')
  }

  function openEditProyek(p) {
    setEditingProyekKode(p.kode_proyek)
    setProyekForm({
      kode_proyek: p.kode_proyek,
      nama_proyek: p.nama_proyek || '',
      nama_singkat: p.nama_singkat || '',
      lokasi: p.lokasi || '',
      zona_waktu: p.zona_waktu || 'Asia/Jayapura',
      tz_label: p.tz_label || (p.zona_waktu === 'Asia/Jakarta' ? 'WIB (UTC+7)' : p.zona_waktu === 'Asia/Makassar' ? 'WITA (UTC+8)' : 'WIT (UTC+9)'),
      status: p.status || 'AKTIF',
      deskripsi: p.deskripsi || ''
    })
    setProyekError('')
    setProyekSuccess('')
  }

  async function handleSaveProyek(e) {
    e.preventDefault()
    if (!proyekForm.kode_proyek.trim()) {
      setProyekError('Kode Proyek (Primary Key) wajib diisi.')
      return
    }
    if (!proyekForm.nama_proyek.trim()) {
      setProyekError('Nama Proyek wajib diisi.')
      return
    }

    setSavingProyek(true)
    setProyekError('')

    let tzLabel = 'WIT (UTC+9)'
    if (proyekForm.zona_waktu === 'Asia/Jakarta') tzLabel = 'WIB (UTC+7)'
    if (proyekForm.zona_waktu === 'Asia/Makassar') tzLabel = 'WITA (UTC+8)'

    try {
      const payload = {
        p_kode_proyek: proyekForm.kode_proyek.trim(),
        p_nama_proyek: proyekForm.nama_proyek.trim(),
        p_nama_singkat: proyekForm.nama_singkat.trim() || proyekForm.nama_proyek.trim(),
        p_lokasi: proyekForm.lokasi.trim() || null,
        p_zona_waktu: proyekForm.zona_waktu,
        p_tz_label: tzLabel,
        p_status: proyekForm.status,
        p_deskripsi: proyekForm.deskripsi.trim() || null
      }

      const { data: resData, error: rpcErr } = await supabase.rpc('absen_upsert_proyek', payload)
      if (rpcErr) throw rpcErr
      if (resData?.error) throw new Error(resData.error)

      setProyekSuccess(`Proyek Kode ${proyekForm.kode_proyek} berhasil disimpan!`)
      loadProyekList()
      openAddProyek()
      setTimeout(() => setProyekSuccess(''), 4000)
    } catch (err) {
      setProyekError(err.message)
    } finally {
      setSavingProyek(false)
    }
  }

  async function load() {
    setLoading(true)
    const { data } = await supabase.rpc('absen_list_karyawan')
    setData(data || [])
    setLoading(false)
  }

  const mandorListDerived = useMemo(() =>
    data.filter(d => d.jabatan && d.jabatan.toLowerCase().includes('mandor') && d.status_aktif),
    [data]
  )

  const mandorMap = useMemo(() => {
    const m = {}
    mandorListDerived.forEach(d => { m[d.id] = d.nama })
    return m
  }, [mandorListDerived])

  function openAdd() {
    setEditing(null)
    setForm({ nama: '', jabatan: '', uid_mesin: '', gaji_bulanan: '', tunjangan: '0', tgl_masuk: '', status_aktif: true, atasan_id: '', no_hp: '', pin: '' })
    setShowPin(false)
    setShowModal(true)
  }

  function openEdit(row) {
    setEditing(row)
    setForm({
      nama: row.nama,
      jabatan: row.jabatan || '',
      uid_mesin: (row.uid_mesin || []).join(', '),
      gaji_bulanan: row.gaji_bulanan || '',
      tunjangan: row.tunjangan || '0',
      tgl_masuk: row.tgl_masuk || '',
      status_aktif: row.status_aktif,
      atasan_id: row.atasan_id || '',
      no_hp: row.no_hp || '',
      pin: row.pin || '',
    })
    setShowPin(false)
    setShowModal(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const payload = {
      nama: form.nama,
      jabatan: form.jabatan || null,
      uid_mesin: form.uid_mesin.split(',').map(s => s.trim()).filter(Boolean),
      gaji_bulanan: parseFloat(form.gaji_bulanan) || 0,
      tunjangan: parseFloat(form.tunjangan) || 0,
      tgl_masuk: form.tgl_masuk || null,
      status_aktif: form.status_aktif,
      atasan_id: form.atasan_id || null,
      no_hp: form.no_hp || null,
      pin: form.pin || null,
    }

    let error
    if (editing) {
      ({ error } = await supabase.rpc('absen_update_karyawan', { p_id: editing.id, p_data: payload }))
    } else {
      ({ error } = await supabase.rpc('absen_tambah_karyawan', { p_data: payload }))
    }
    if (error) { alert(error.message); setSaving(false); return }
    setSaving(false)
    setShowModal(false)
    load()
  }

  function handleImportFile(e) {
    const f = e.target.files[0]
    if (!f) return
    setImportError('')
    setImportResult(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' })
        const sheetName = wb.SheetNames.find(s => s.toUpperCase() === 'JUN') || wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

        const employees = []
        const seen = new Set()

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          if (!row || row.length < 7) continue
          const no = row[2]
          const nama = row[3]
          const uid = row[4]
          const mandor = row[5]
          const jabatan = row[6]
          if (typeof no !== 'number' || !nama || typeof nama !== 'string') continue
          if (!uid) continue
          const uidStr = String(uid).trim()
          if (seen.has(uidStr)) continue
          seen.add(uidStr)
          employees.push({
            nama: String(nama).trim(),
            uid_mesin: uidStr,
            mandor: mandor ? String(mandor).trim() : '',
            jabatan: jabatan ? String(jabatan).trim() : '',
            rowNum: i + 1,
          })
        }

        if (employees.length === 0) {
          setImportError('Tidak ditemukan data karyawan yang valid di file')
          setImportPreview(null)
          return
        }
        setImportPreview(employees)
      } catch (err) {
        setImportError('Gagal membaca file: ' + err.message)
        setImportPreview(null)
      }
    }
    reader.readAsArrayBuffer(f)
  }

  async function handleImportConfirm() {
    if (!importPreview) return
    setImporting(true)
    setImportError('')

    const payload = importPreview.map(emp => ({
      nama: emp.nama,
      uid_mesin: emp.uid_mesin,
      jabatan: emp.jabatan || '',
      mandor: emp.mandor || '',
    }))

    const { data: result, error } = await supabase.rpc('absen_import_karyawan', { p_data: payload })

    if (error) {
      setImportError(error.message)
    } else {
      setImportResult({
        added: result.added,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors || [],
      })
      setImportPreview(null)
      load()
    }
    setImporting(false)
  }

  const filtered = data.filter(d => {
    const q = search.toLowerCase()
    const atasanNama = (mandorMap[d.atasan_id] || '').toLowerCase()
    return (
      d.nama.toLowerCase().includes(q) ||
      (d.uid_mesin || []).some(u => u.toLowerCase().includes(q)) ||
      (d.jabatan || '').toLowerCase().includes(q) ||
      atasanNama.includes(q)
    )
  })

  const groupedData = useMemo(() => {
    const groups = {}
    filtered.forEach(row => {
      const mandorName = mandorMap[row.atasan_id] || (row.mandor_nama && row.mandor_nama !== '-' ? row.mandor_nama : 'Harian Kantor')
      if (!groups[mandorName]) {
        groups[mandorName] = []
      }
      groups[mandorName].push(row)
    })
    const keys = Object.keys(groups).sort((a, b) => {
      if (a === 'Harian Kantor') return 1
      if (b === 'Harian Kantor') return -1
      return a.localeCompare(b)
    })
    return keys.map(key => ({
      mandorName: key,
      items: groups[key]
    }))
  }, [filtered, mandorMap])

  const fmt = n => new Intl.NumberFormat('id-ID').format(n || 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Master Karyawan</h1>
          <p className="text-gray-500 text-xs mt-0.5">Kelola data karyawan proyek</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowProyekModal(true); loadProyekList() }} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-colors border border-slate-700 shadow-sm">
            <Building2 size={14} className="text-cyan-400" /> Tambah Proyek Aktif
          </button>
          <button onClick={() => { setShowImport(true); setImportPreview(null); setImportResult(null); setImportError('') }} className="btn-success text-xs">
            <Upload size={14} /> Import Excel
          </button>
          <button onClick={openAdd} className="btn-primary text-xs">
            <Plus size={14} /> Tambah
          </button>
        </div>
      </div>

      <div className="main-content">
      {/* Table */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama, UID, atau jabatan..." className="input-field pl-10" />
          </div>
          <span className="text-sm text-gray-500 whitespace-nowrap font-medium">{filtered.length} karyawan ({groupedData.length} kelompok)</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="text-left px-5 py-3 w-8">#</th>
                  <th className="text-left px-4 py-3">Nama</th>
                  <th className="text-left px-4 py-3">UID Mesin</th>
                  <th className="text-left px-4 py-3">Jabatan</th>
                  <th className="text-left px-4 py-3">Mandor / Atasan</th>
                  <th className="text-right px-4 py-3">Gaji Bulanan</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-center px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groupedData.map((group) => (
                  <Fragment key={group.mandorName}>
                    <tr className="bg-slate-100/90 font-bold border-y border-slate-200">
                      <td colSpan={8} className="px-5 py-2.5 text-xs text-slate-800 uppercase tracking-wider bg-slate-100/90">
                        <span className="inline-flex items-center gap-2 font-bold text-slate-800">
                          {group.mandorName === 'Harian Kantor' ? (
                            <>
                              <Building2 size={16} className="text-blue-600 shrink-0" />
                              <span>HARIAN KANTOR</span>
                            </>
                          ) : (
                            <>
                              <HardHat size={16} className="text-amber-600 shrink-0" />
                              <span>MANDOR / ATASAN: {group.mandorName.toUpperCase()}</span>
                            </>
                          )}
                        </span>
                        <span className="ml-2.5 font-semibold text-slate-500 normal-case">
                          ({group.items.length} Pekerja)
                        </span>
                      </td>
                    </tr>
                    {group.items.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-5 py-3 text-gray-400">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.nama}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{(row.uid_mesin || []).join(', ')}</td>
                        <td className="px-4 py-3 text-gray-500">{row.jabatan || '-'}</td>
                        <td className="px-4 py-3 text-gray-500">{mandorMap[row.atasan_id] || (row.mandor_nama && row.mandor_nama !== '-' ? row.mandor_nama : 'Harian Kantor')}</td>
                        <td className="px-4 py-3 text-right text-gray-900">{row.gaji_bulanan > 0 ? `Rp ${fmt(row.gaji_bulanan)}` : '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`badge ${row.status_aktif ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {row.status_aktif ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => openEdit(row)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <Pencil size={13} /> Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                    <Users size={32} className="mx-auto text-gray-300 mb-2" />
                    Tidak ada data
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Tambah/Edit */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <span className="font-semibold text-gray-900">{editing ? 'Edit' : 'Tambah'} Karyawan</span>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nama *</label>
                <input value={form.nama} onChange={e => setForm({...form, nama: e.target.value})} required className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">UID Mesin (pisahkan koma)</label>
                <input value={form.uid_mesin} onChange={e => setForm({...form, uid_mesin: e.target.value})} className="input-field" placeholder="80042387, 80042388" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Jabatan</label>
                  <input value={form.jabatan} onChange={e => setForm({...form, jabatan: e.target.value})} className="input-field" placeholder="CW, Helper, dll" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Tgl Masuk</label>
                  <input type="date" value={form.tgl_masuk} onChange={e => setForm({...form, tgl_masuk: e.target.value})} className="input-field" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Gaji Bulanan</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Rp</span>
                    <input type="text" inputMode="numeric" value={fmtRupiah(form.gaji_bulanan)} onChange={e => setForm({...form, gaji_bulanan: parseRupiah(e.target.value)})} className="input-field pl-9" placeholder="0" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Tunjangan</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">Rp</span>
                    <input type="text" inputMode="numeric" value={fmtRupiah(form.tunjangan)} onChange={e => setForm({...form, tunjangan: parseRupiah(e.target.value)})} className="input-field pl-9" placeholder="0" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mandor</label>
                <select value={form.atasan_id} onChange={e => setForm({...form, atasan_id: e.target.value})} className="input-field">
                  <option value="">-- Harian Kantor --</option>
                  {mandorListDerived.map(a => <option key={a.id} value={a.id}>{a.nama}</option>)}
                </select>
              </div>
              <div className="border-t border-white/10 pt-4 mt-2">
                <p className="text-xs font-semibold text-cyan-400 mb-3">Login User App (SI WAJAH Mobile)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">No. HP</label>
                    <input type="tel" value={form.no_hp} onChange={e => setForm({...form, no_hp: e.target.value})} className="input-field" placeholder="08xxxxxxxxxx" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">PIN</label>
                    <div className="relative">
                      <input
                        type={showPin ? 'text' : 'password'}
                        inputMode="numeric"
                        maxLength={6}
                        value={form.pin}
                        onChange={e => setForm({...form, pin: e.target.value.replace(/\D/g, '')})}
                        className="input-field pr-10 font-mono tracking-widest"
                        placeholder="4-6 digit"
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
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="aktif" checked={form.status_aktif} onChange={e => setForm({...form, status_aktif: e.target.checked})} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <label htmlFor="aktif" className="text-sm text-gray-700">Status Aktif</label>
              </div>
              <div className="flex gap-3 justify-end pt-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Batal</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Import */}
      {showImport && (
        <div className="modal-overlay">
          <div className="modal-content max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <span className="font-semibold text-gray-900 flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                  <FileSpreadsheet size={16} className="text-emerald-600" />
                </div>
                Import Data Karyawan
              </span>
              <button onClick={() => setShowImport(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-blue-500/10 border border-blue-400/30 rounded-xl p-4 text-sm text-blue-300">
                <p className="font-medium mb-1 text-blue-200">Format file yang didukung:</p>
                <p>Sheet "JUN" — Kolom D: Nama, Kolom E: UID, Kolom F: Mandor, Kolom G: Jabatan</p>
                <p className="text-xs mt-1 text-blue-400/80">File absensi tenaga kerja proyek (.xlsx)</p>
              </div>

              <label className="block cursor-pointer">
                <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center hover:border-emerald-400 hover:bg-emerald-500/10 transition-all duration-200">
                  <Upload size={28} className="mx-auto text-slate-400 mb-2" />
                  <p className="text-slate-300 text-sm font-medium">Pilih file Excel (.xlsx)</p>
                </div>
                <input type="file" accept=".xlsx,.xls" onChange={handleImportFile} className="hidden" />
              </label>

              {importError && (
                <div className="bg-red-500/10 border border-red-400/30 text-red-400 rounded-xl p-3.5 text-sm flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {importError}
                </div>
              )}

              {importPreview && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium text-sm text-slate-200">{importPreview.length} karyawan ditemukan</span>
                  </div>
                  <div className="table-scroll rounded-xl max-h-60 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="table-header sticky top-0">
                        <tr>
                          <th className="text-left px-4 py-2.5">#</th>
                          <th className="text-left px-4 py-2.5">Nama</th>
                          <th className="text-left px-4 py-2.5">UID</th>
                          <th className="text-left px-4 py-2.5">Mandor</th>
                          <th className="text-left px-4 py-2.5">Jabatan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {importPreview.map((emp, i) => {
                          const exists = data.some(d => (d.uid_mesin || []).includes(emp.uid_mesin))
                          return (
                            <tr key={i} className={exists ? 'bg-amber-500/10' : ''}>
                              <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                              <td className="px-4 py-2 font-medium text-slate-200">{emp.nama}</td>
                              <td className="px-4 py-2 font-mono text-xs text-cyan-400">{emp.uid_mesin}</td>
                              <td className="px-4 py-2 text-slate-300">{emp.mandor}</td>
                              <td className="px-4 py-2 text-slate-300">{emp.jabatan}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 bg-amber-500/20 border border-amber-500/40 rounded" /> UID sudah ada (akan di-skip atau update)
                  </p>

                  <div className="flex gap-3 mt-4">
                    <button onClick={handleImportConfirm} disabled={importing} className="btn-success">
                      {importing ? 'Mengimpor...' : `Import ${importPreview.length} Karyawan`}
                    </button>
                    <button onClick={() => setImportPreview(null)} className="btn-secondary">Batal</button>
                  </div>
                </div>
              )}

              {importResult && (
                <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-5">
                  <div className="flex items-center gap-2.5 text-emerald-400 font-semibold mb-3">
                    <CheckCircle size={18} /> Import selesai
                  </div>
                  <div className="text-sm text-emerald-300 space-y-1">
                    <p>Ditambahkan: {importResult.added} karyawan baru</p>
                    <p>Diupdate: {importResult.updated} karyawan (jabatan/mandor)</p>
                    <p>Di-skip: {importResult.skipped} (sudah ada, tidak berubah)</p>
                    {importResult.errors.length > 0 && (
                      <div className="mt-2 text-red-400">
                        <p className="font-medium">Gagal:</p>
                        {importResult.errors.map((e, i) => <p key={i} className="text-xs">{e}</p>)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Kelola Proyek Aktif */}
      {showProyekModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Building2 size={20} className="text-blue-600" /> Kelola Proyek Aktif SI WAJAH
                </h3>
                <p className="text-xs text-slate-500 font-medium">Tambah & atur proyek aktif (Kode Proyek = Primary Key)</p>
              </div>
              <button onClick={() => setShowProyekModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                <X size={18} />
              </button>
            </div>

            {proyekSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700 flex items-center gap-2">
                <CheckCircle size={16} /> {proyekSuccess}
              </div>
            )}
            {proyekError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-center gap-2">
                <AlertTriangle size={16} /> {proyekError}
              </div>
            )}

            {/* List Existing Projects */}
            <div className="mb-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Daftar Proyek Aktif Terdaftar</h4>
              {loadingProyek ? (
                <div className="py-6 text-center text-xs text-slate-500 font-medium">Memuat daftar proyek...</div>
              ) : (
                <div className="space-y-2.5">
                  {proyekList.map(p => (
                    <div key={p.kode_proyek} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-black tracking-wider">
                          {p.kode_proyek}
                        </span>
                        <div>
                          <h5 className="text-xs font-black text-slate-900">{p.nama_proyek}</h5>
                          <p className="text-[11px] text-slate-500 font-medium">{p.lokasi || 'Tanpa Lokasi'} • {p.tz_label || p.zona_waktu}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">{p.status || 'AKTIF'}</span>
                        <button type="button" onClick={() => openEditProyek(p)} className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-600">
                          <Pencil size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form Add / Edit Project */}
            <form onSubmit={handleSaveProyek} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  {editingProyekKode ? `Edit Proyek Kode ${editingProyekKode}` : '+ Tambah Proyek Aktif Baru'}
                </h4>
                {editingProyekKode && (
                  <button type="button" onClick={openAddProyek} className="text-xs font-bold text-blue-600 hover:underline">
                    Batal Edit / Tambah Baru
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kode Proyek (Primary Key) *</label>
                  <input
                    type="text"
                    value={proyekForm.kode_proyek}
                    onChange={e => setProyekForm({ ...proyekForm, kode_proyek: e.target.value })}
                    disabled={!!editingProyekKode}
                    placeholder="Contoh: 524006"
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 disabled:bg-slate-100"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status Proyek *</label>
                  <select
                    value={proyekForm.status}
                    onChange={e => setProyekForm({ ...proyekForm, status: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="AKTIF">AKTIF</option>
                    <option value="NONAKTIF">NONAKTIF</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nama Proyek *</label>
                  <input
                    type="text"
                    value={proyekForm.nama_proyek}
                    onChange={e => setProyekForm({ ...proyekForm, nama_proyek: e.target.value })}
                    placeholder="Contoh: Proyek Portsite Accommodation Complex"
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nama Singkat Proyek</label>
                  <input
                    type="text"
                    value={proyekForm.nama_singkat}
                    onChange={e => setProyekForm({ ...proyekForm, nama_singkat: e.target.value })}
                    placeholder="Contoh: Portsite Accommodation Complex"
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Lokasi Site Proyek</label>
                  <input
                    type="text"
                    value={proyekForm.lokasi}
                    onChange={e => setProyekForm({ ...proyekForm, lokasi: e.target.value })}
                    placeholder="Contoh: Portsite, Papua"
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Zona Waktu Site Proyek *</label>
                  <select
                    value={proyekForm.zona_waktu}
                    onChange={e => setProyekForm({ ...proyekForm, zona_waktu: e.target.value })}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    <option value="Asia/Jayapura">WIT - Asia/Jayapura (UTC+9)</option>
                    <option value="Asia/Makassar">WITA - Asia/Makassar (UTC+8)</option>
                    <option value="Asia/Jakarta">WIB - Asia/Jakarta (UTC+7)</option>
                  </select>
                </div>
              </div>

              <div className="text-xs">
                <label className="block font-bold text-slate-700 mb-1">Deskripsi Proyek (Opsional)</label>
                <textarea
                  value={proyekForm.deskripsi}
                  onChange={e => setProyekForm({ ...proyekForm, deskripsi: e.target.value })}
                  placeholder="Catatan / deskripsi proyek..."
                  rows={2}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 resize-none font-sans"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingProyek}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors shadow-md disabled:opacity-50"
                >
                  {savingProyek ? 'Menyimpan...' : 'Simpan Proyek'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
