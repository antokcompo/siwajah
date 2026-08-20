import { useEffect, useState, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getDistanceMeters, formatDistance } from '../lib/geoUtils'
import { Check, X, Clock, Search, Plus, Trash2, Users, ClipboardCheck, CalendarPlus, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

const namaBulan = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

const statusColor = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
}
const statusLabel = {
  PENDING: 'Menunggu Approval',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
}

export default function ApprovalLembur() {
  const [mainTab, setMainTab] = useState('daftar')

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="page-title">Lembur</h1>
          <div className="flex gap-1 bg-white/10 p-0.5 rounded-lg">
            <button onClick={() => setMainTab('daftar')} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm transition-all duration-150 ${mainTab === 'daftar' ? 'bg-blue-500 text-white font-semibold shadow-md' : 'text-slate-300 font-medium hover:text-white'}`}>
              <CalendarPlus size={14} /> Daftar Lembur
            </button>
            <button onClick={() => setMainTab('approval')} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm transition-all duration-150 ${mainTab === 'approval' ? 'bg-blue-500 text-white font-semibold shadow-md' : 'text-slate-300 font-medium hover:text-white'}`}>
              <ClipboardCheck size={14} /> Approval Jam
            </button>
          </div>
        </div>
      </div>
      <div className="main-content">
        {mainTab === 'daftar' ? <DaftarLemburTab /> : <ApprovalTab />}
      </div>
    </div>
  )
}

function DaftarLemburTab() {
  const { profile } = useAuth()
  const role = profile?.role
  const canApprove = role === 'admin' || role === 'manajemen'

  const [tanggal, setTanggal] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [daftar, setDaftar] = useState([])
  const [allKaryawan, setAllKaryawan] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [searchAdd, setSearchAdd] = useState('')
  const [selected, setSelected] = useState([])
  const [catatan, setCatatan] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [processing, setProcessing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { loadDaftar() }, [tanggal])

  async function loadDaftar() {
    setLoading(true)
    const { data } = await supabase
      .from('absen_daftar_lembur')
      .select('*, absen_karyawan(nama, jabatan, atasan_id)')
      .eq('tanggal', tanggal)
      .order('created_at', { ascending: true })
    setDaftar(data || [])
    setLoading(false)
  }

  async function openAddModal() {
    const { data } = await supabase
      .from('absen_karyawan')
      .select('id, nama, jabatan')
      .eq('status_aktif', true)
      .order('nama')
    setAllKaryawan(data || [])
    setSelected([])
    setSearchAdd('')
    setCatatan('')
    setShowAdd(true)
  }

  const registeredIds = daftar.map(d => d.karyawan_id)
  const availableKaryawan = allKaryawan.filter(k => !registeredIds.includes(k.id))
  const filteredAdd = searchAdd.trim()
    ? availableKaryawan.filter(k => k.nama.toLowerCase().includes(searchAdd.toLowerCase()) || (k.jabatan || '').toLowerCase().includes(searchAdd.toLowerCase()))
    : availableKaryawan

  async function handleAdd() {
    if (selected.length === 0) return
    setSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('absen_daftarkan_lembur', {
        p_tanggal: tanggal,
        p_karyawan_ids: selected,
        p_catatan: catatan || null,
        p_user_id: profile?.id || null,
      })
      if (error) throw error
      setShowAdd(false)
      loadDaftar()
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(item) {
    if (item.status === 'APPROVED' && role !== 'admin') {
      alert('Hanya admin yang dapat menghapus data lembur yang sudah diapprove')
      return
    }
    if (item.status === 'APPROVED') {
      setConfirmDelete(item.id)
      return
    }
    doRemove(item.id)
  }

  async function doRemove(id) {
    const { data, error } = await supabase.rpc('absen_hapus_daftar_lembur', { p_id: id })
    if (error) alert(error.message)
    else if (data?.error) alert(data.error)
    else loadDaftar()
    setConfirmDelete(null)
  }

  async function handleApproveAll() {
    const pendingIds = daftar.filter(d => d.status === 'PENDING').map(d => d.id)
    if (pendingIds.length === 0) return
    setProcessing('all')
    try {
      const { error } = await supabase.rpc('absen_approve_daftar_lembur', {
        p_ids: pendingIds,
        p_status: 'APPROVED',
        p_user_id: profile?.id || null,
      })
      if (error) throw error
      loadDaftar()
    } catch (err) {
      alert(err.message)
    } finally {
      setProcessing(null)
    }
  }

  async function handleApproveOne(id, status) {
    setProcessing(id)
    try {
      const { error } = await supabase.rpc('absen_approve_daftar_lembur', {
        p_ids: [id],
        p_status: status,
        p_user_id: profile?.id || null,
      })
      if (error) throw error
      loadDaftar()
    } catch (err) {
      alert(err.message)
    } finally {
      setProcessing(null)
    }
  }

  function toggleSelect(id) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function selectAll() {
    if (selected.length === filteredAdd.length) setSelected([])
    else setSelected(filteredAdd.map(k => k.id))
  }

  const tglLabel = new Date(tanggal + 'T00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  const pendingCount = daftar.filter(d => d.status === 'PENDING').length
  const approvedCount = daftar.filter(d => d.status === 'APPROVED').length

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={tanggal}
            onChange={e => setTanggal(e.target.value)}
            className="input-field text-sm py-1.5"
          />
          <span className="text-sm text-slate-400">{tglLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {canApprove && pendingCount > 0 && (
            <button
              onClick={handleApproveAll}
              disabled={processing === 'all'}
              className="btn-success flex items-center gap-2 text-sm"
            >
              <CheckCircle size={14} /> Approve Semua ({pendingCount})
            </button>
          )}
          <button onClick={openAddModal} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Tambah Karyawan
          </button>
        </div>
      </div>

      <div className="card">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-cyan-500" />
            <span className="text-sm font-semibold text-gray-900">Daftar Lembur</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {pendingCount > 0 && <span className="text-amber-600">{pendingCount} pending</span>}
            {approvedCount > 0 && <span className="text-emerald-600">{approvedCount} approved</span>}
            <span className="text-gray-400">{daftar.length} total</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : daftar.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400">
            <Users size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm">Belum ada karyawan terdaftar lembur</p>
            <p className="text-xs mt-1">Klik "Tambah Karyawan" untuk mendaftarkan</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="text-left px-5 py-3">Nama</th>
                  <th className="text-left px-4 py-3">Jabatan</th>
                  <th className="text-left px-4 py-3">Catatan</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-center px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {daftar.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{d.absen_karyawan?.nama}</td>
                    <td className="px-4 py-3 text-gray-600">{d.absen_karyawan?.jabatan || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{d.catatan || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge text-xs ${statusColor[d.status] || ''}`}>
                        {statusLabel[d.status] || d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {canApprove && d.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleApproveOne(d.id, 'APPROVED')}
                              disabled={processing === d.id}
                              className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                              title="Approve"
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              onClick={() => handleApproveOne(d.id, 'REJECTED')}
                              disabled={processing === d.id}
                              className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Reject"
                            >
                              <XCircle size={16} />
                            </button>
                          </>
                        )}
                        {(d.status === 'PENDING' || role === 'admin') && (
                          <button
                            onClick={() => handleRemove(d)}
                            className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Hapus"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm delete approved */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Hapus Data Approved?</h3>
              <p className="text-sm text-gray-500 mb-4">
                Data lembur ini sudah diapprove. Menghapus akan membatalkan akses lembur karyawan ini.
              </p>
              <div className="flex gap-2 justify-center">
                <button onClick={() => setConfirmDelete(null)} className="btn-secondary">Batal</button>
                <button onClick={() => doRemove(confirmDelete)} className="btn-danger">Hapus</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add employees modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <span className="font-semibold text-gray-900">Tambah Karyawan Lembur</span>
              <button onClick={() => setShowAdd(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-gray-500">Tanggal: {tglLabel}</p>

              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchAdd}
                  onChange={e => setSearchAdd(e.target.value)}
                  placeholder="Cari nama..."
                  className="input-field pl-9"
                />
              </div>

              <div className="flex items-center justify-between">
                <button onClick={selectAll} className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                  {selected.length === filteredAdd.length && filteredAdd.length > 0 ? 'Batal Pilih Semua' : 'Pilih Semua'}
                </button>
                <span className="text-xs text-gray-400">{selected.length} dipilih</span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-2">
                {filteredAdd.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">
                    {availableKaryawan.length === 0 ? 'Semua karyawan sudah terdaftar' : 'Tidak ditemukan'}
                  </p>
                ) : filteredAdd.map(k => (
                  <button
                    key={k.id}
                    onClick={() => toggleSelect(k.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all ${
                      selected.includes(k.id)
                        ? 'bg-cyan-500/15 border border-cyan-500/30'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selected.includes(k.id) ? 'bg-cyan-500 border-cyan-500' : 'border-gray-300'
                    }`}>
                      {selected.includes(k.id) && <Check size={12} className="text-white" />}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{k.nama}</div>
                      <div className="text-[10px] text-gray-400">{k.jabatan || '-'}</div>
                    </div>
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Catatan (opsional)</label>
                <input
                  value={catatan}
                  onChange={e => setCatatan(e.target.value)}
                  placeholder="Contoh: proyek mengejar deadline..."
                  className="input-field text-sm"
                />
              </div>

              <button
                onClick={handleAdd}
                disabled={selected.length === 0 || submitting}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Plus size={16} />
                )}
                {submitting ? 'Mendaftarkan...' : `Daftarkan ${selected.length} Karyawan`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ApprovalTab() {
  const now = new Date()
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())
  const [data, setData] = useState([])
  const [mandorMap, setMandorMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  const [catatan, setCatatan] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('pending')
  const [editModalItem, setEditModalItem] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  useEffect(() => { load() }, [tab, bulan, tahun])

  async function load() {
    setLoading(true)
    const startDate = `${tahun}-${String(bulan).padStart(2, '0')}-01`
    const endDate = bulan === 12 ? `${tahun + 1}-01-01` : `${tahun}-${String(bulan + 1).padStart(2, '0')}-01`

    let q = supabase
      .from('absen_harian')
      .select('*, absen_karyawan(nama, jabatan, atasan_id)')
      .gte('tanggal', startDate)
      .lt('tanggal', endDate)
      .order('tanggal', { ascending: false })

    if (tab === 'pending') q = q.eq('status_lembur', 'PENDING_APPROVAL')
    else q = q.in('status_lembur', ['APPROVED','REJECTED'])

    const [harianRes, mandorRes, configRes, scanRes] = await Promise.all([
      q,
      supabase.from('absen_karyawan').select('id, nama').ilike('jabatan', '%mandor%').eq('status_aktif', true),
      supabase.from('absen_konfigurasi').select('key, value'),
      supabase.from('absen_scan_wajah').select('karyawan_id, tanggal, slot_id, gps_lat, gps_lng, lokasi_kerja').gte('tanggal', startDate).lt('tanggal', endDate)
    ])

    const cfgMap = {}
    configRes.data?.forEach(r => { cfgMap[r.key] = r.value })
    const siteLat = Number(cfgMap.site_lat || -6.200000)
    const siteLng = Number(cfgMap.site_lng || 106.816666)
    const siteRadius = Number(cfgMap.site_radius_meter || 500)

    const scanMap = {}
    scanRes.data?.forEach(s => {
      const key = `${s.karyawan_id}_${s.tanggal}`
      if (!scanMap[key]) scanMap[key] = []
      if (s.gps_lat && s.gps_lng) {
        const dist = getDistanceMeters(s.gps_lat, s.gps_lng, siteLat, siteLng)
        s.distanceMeters = dist
        s.isOffsite = dist > siteRadius
      }
      scanMap[key].push(s)
    })

    const enriched = (harianRes.data || []).map(h => {
      const key = `${h.karyawan_id}_${h.tanggal}`
      const scans = scanMap[key] || []
      const offsiteScan = scans.find(s => s.isOffsite)
      return {
        ...h,
        scans,
        isOffsite: !!offsiteScan,
        offsiteDist: offsiteScan?.distanceMeters || 0
      }
    })

    setData(enriched)
    const mMap = {}
    ;(mandorRes.data || []).forEach(m => { mMap[m.id] = m.nama })
    setMandorMap(mMap)
    setLoading(false)
  }

  function handleOpenModal(d, isReject = false) {
    const tglFormatted = new Date(d.tanggal + 'T00:00').toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })
    setEditModalItem({
      id: d.id,
      nama: d.absen_karyawan?.nama || 'Pekerja',
      tglFormatted,
      jam_pulang: d.jam_pulang?.slice(0, 5) || '-',
      originalJamLembur: d.jam_lembur || 0,
      jamLembur: d.jam_lembur || 0,
      catatan: d.catatan || '',
      isReject
    })
  }

  async function handleSaveModalApproval() {
    if (!editModalItem) return
    setEditSubmitting(true)
    try {
      const status = editModalItem.isReject ? 'REJECTED' : 'APPROVED'
      const correctedHours = editModalItem.isReject ? null : Number(editModalItem.jamLembur)
      const { error } = await supabase.rpc('absen_approve_lembur', {
        p_absensi_id: editModalItem.id,
        p_status: status,
        p_catatan: editModalItem.catatan || null,
        p_jam_lembur: correctedHours
      })
      if (error) throw error
      setEditModalItem(null)
      load()
    } catch (err) {
      alert('Gagal memproses approval: ' + err.message)
    } finally {
      setEditSubmitting(false)
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter(d =>
      (d.absen_karyawan?.nama || '').toLowerCase().includes(q) ||
      (d.absen_karyawan?.jabatan || '').toLowerCase().includes(q)
    )
  }, [data, search])

  const grouped = useMemo(() => {
    const groups = {}
    filtered.forEach(d => {
      const atasanId = d.absen_karyawan?.atasan_id
      const groupName = atasanId && mandorMap[atasanId] ? mandorMap[atasanId] : 'Harian Kantor'
      if (!groups[groupName]) groups[groupName] = []
      groups[groupName].push(d)
    })
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Harian Kantor') return 1
      if (b === 'Harian Kantor') return -1
      return a.localeCompare(b)
    })
  }, [filtered, mandorMap])

  return (
    <>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 bg-white/10 p-0.5 rounded-lg">
          <button onClick={() => setTab('pending')} className={`px-4 py-1.5 rounded-md text-sm transition-all duration-150 ${tab === 'pending' ? 'bg-blue-500 text-white font-semibold shadow-md' : 'text-slate-300 font-medium hover:text-white'}`}>
            Pending
          </button>
          <button onClick={() => setTab('history')} className={`px-4 py-1.5 rounded-md text-sm transition-all duration-150 ${tab === 'history' ? 'bg-blue-500 text-white font-semibold shadow-md' : 'text-slate-300 font-medium hover:text-white'}`}>
            Riwayat
          </button>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <select value={bulan} onChange={e => setBulan(+e.target.value)} className="select-field text-sm py-1.5">
            {namaBulan.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
          </select>
          <select value={tahun} onChange={e => setTahun(+e.target.value)} className="select-field text-sm py-1.5">
            {Array.from({ length: new Date().getFullYear() - 2024 + 3 }, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama atau jabatan..." className="input-field pl-10" />
          </div>
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
                  <th className="text-left px-5 py-3">Nama</th>
                  <th className="text-center px-4 py-3">Tanggal</th>
                  <th className="text-center px-4 py-3">Pulang</th>
                  <th className="text-center px-4 py-3">Jam Lembur</th>
                  {tab === 'pending' ? (
                    <th className="text-center px-4 py-3">Aksi Approval</th>
                  ) : (
                    <th className="text-center px-4 py-3">Status & Catatan</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grouped.map(([groupName, items]) => (
                  <Fragment key={groupName}>
                    <tr className="table-group-header">
                      <td colSpan={5} className="px-5 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{groupName}</span>
                          <span className="text-xs text-slate-400">{items.length} data</span>
                        </div>
                      </td>
                    </tr>
                    {items.map(d => (
                      <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900">
                          <div>{d.absen_karyawan?.nama}</div>
                          {d.isOffsite && (
                            <div className="mt-1">
                              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold text-[10px] border border-rose-500/30 inline-flex items-center gap-1">
                                <AlertTriangle size={11} /> Off-Site ({formatDistance(d.offsiteDist)})
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-600 whitespace-nowrap">{new Date(d.tanggal + 'T00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td className="px-4 py-3 text-center text-gray-600 font-mono">{d.jam_pulang?.slice(0, 5) || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1.5 text-orange-600 font-medium">
                            <Clock size={14} /> {d.jam_lembur} jam
                          </span>
                        </td>
                        {tab === 'pending' ? (
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenModal(d, false)}
                                className="btn-success py-1 px-2.5 text-xs flex items-center gap-1"
                                title="Approve atau koreksi jam lembur"
                              >
                                <Check size={13} /> Approve / Koreksi
                              </button>
                              <button
                                onClick={() => handleOpenModal(d, true)}
                                className="btn-danger py-1 px-2.5 text-xs flex items-center gap-1"
                                title="Tolak lembur"
                              >
                                <X size={13} /> Reject
                              </button>
                            </div>
                          </td>
                        ) : (
                          <td className="px-4 py-3 text-center">
                            <span className={`badge ${d.status_lembur === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {d.status_lembur}
                            </span>
                            {d.catatan && <div className="text-xs text-gray-400 mt-1">{d.catatan}</div>}
                          </td>
                        )}
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                    <Clock size={32} className="mx-auto text-gray-300 mb-2" />
                    {search.trim() ? 'Tidak ditemukan' : tab === 'pending' ? 'Tidak ada lembur pending' : 'Belum ada riwayat'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Koreksi & Approval Jam Lembur */}
      {editModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Clock className="text-cyan-400" size={20} />
                <h3 className="font-bold text-white text-base">
                  {editModalItem.isReject ? 'Tolak Lembur' : 'Approval & Koreksi Jam Lembur'}
                </h3>
              </div>
              <button onClick={() => setEditModalItem(null)} className="p-1 text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-300">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1 font-sans">
                <div><span className="text-slate-500">Nama Pekerja:</span> <strong className="text-white font-semibold">{editModalItem.nama}</strong></div>
                <div><span className="text-slate-500">Tanggal Lembur:</span> <strong className="text-white font-mono">{editModalItem.tglFormatted}</strong></div>
                <div><span className="text-slate-500">Jam Scan Pulang:</span> <strong className="text-cyan-300 font-mono">{editModalItem.jam_pulang}</strong></div>
                <div><span className="text-slate-500">Jam Lembur Sistem:</span> <strong className="text-amber-300 font-mono">{editModalItem.originalJamLembur} jam</strong></div>
              </div>

              {!editModalItem.isReject && (
                <div>
                  <label className="block text-xs font-bold text-slate-200 mb-1">
                    Koreksi Jam Lembur (Jam)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="12"
                      value={editModalItem.jamLembur}
                      onChange={e => setEditModalItem({ ...editModalItem, jamLembur: e.target.value })}
                      className="input-field text-sm font-bold font-mono py-2 text-cyan-300 bg-slate-950 border-slate-800"
                    />
                    <span className="text-slate-400 font-semibold">Jam</span>
                  </div>
                  {Number(editModalItem.jamLembur) !== Number(editModalItem.originalJamLembur) && (
                    <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1 font-medium">
                      <AlertTriangle size={12} /> Dihitung {editModalItem.jamLembur} jam (semula {editModalItem.originalJamLembur}h).
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  {editModalItem.isReject ? 'Alasan Penolakan (Wajib)' : 'Alasan Koreksi / Catatan Approval'}
                </label>
                <textarea
                  value={editModalItem.catatan}
                  onChange={e => setEditModalItem({ ...editModalItem, catatan: e.target.value })}
                  placeholder={editModalItem.isReject ? "Masukan alasan menolak lembur ini..." : "Contoh: Pulang lebih awal jam 21:30, dihitung 2.5 jam..."}
                  className="w-full h-20 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-sans"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditModalItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveModalApproval}
                disabled={editSubmitting || (editModalItem.isReject && !editModalItem.catatan.trim())}
                className={`px-5 py-2 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-lg ${
                  editModalItem.isReject
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {editSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check size={15} />
                )}
                <span>{editModalItem.isReject ? 'Tolak Lembur' : 'Setujui & Simpan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
