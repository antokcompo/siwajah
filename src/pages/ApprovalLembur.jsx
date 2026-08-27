import { useEffect, useState, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getDistanceMeters, formatDistance } from '../lib/geoUtils'
import { Check, X, Clock, Search, Plus, Trash2, Users, ClipboardCheck, CalendarPlus, CheckCircle, XCircle, AlertTriangle, Calendar, Filter, Activity, ClipboardList, CheckCircle2 } from 'lucide-react'
import { getActiveProject } from './PilihProyek'

const namaBulan = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

const statusColor = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-300',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  REJECTED: 'bg-rose-100 text-rose-700 border-rose-300',
  PROSES: 'bg-cyan-100 text-cyan-800 border-cyan-300',
}

const statusLabel = {
  PENDING: 'Menunggu Approval',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  PROSES: 'Sedang Lembur (Belum Pulang)',
}

export default function ApprovalLembur() {
  const [mainTab, setMainTab] = useState('daftar')

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="page-title">Rekap & Management Lembur</h1>
          <div className="bg-slate-950/90 p-1.5 rounded-2xl border border-slate-800 shadow-inner inline-flex items-center gap-1.5 backdrop-blur-md">
            <button
              onClick={() => setMainTab('daftar')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                mainTab === 'daftar'
                  ? 'bg-cyan-500/20 !text-white border border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.35)]'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/60 font-medium'
              }`}
            >
              <CalendarPlus size={14} className={mainTab === 'daftar' ? 'text-cyan-400' : 'text-slate-400'} />
              <span className="!text-white font-extrabold tracking-wide">Pendaftaran Lembur</span>
            </button>
            <button
              onClick={() => setMainTab('approval')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                mainTab === 'approval'
                  ? 'bg-cyan-500/20 !text-white border border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.35)]'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/60 font-medium'
              }`}
            >
              <ClipboardCheck size={14} className={mainTab === 'approval' ? 'text-cyan-400' : 'text-slate-400'} />
              <span className="!text-white font-extrabold tracking-wide">Rekap & Approval Jam</span>
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

  const now = new Date()
  const [viewMode, setViewMode] = useState('date') // 'date' | 'month'
  const [tanggal, setTanggal] = useState(() => {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())

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

  useEffect(() => {
    loadDaftar()
    const handleStorage = () => loadDaftar()
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [viewMode, tanggal, bulan, tahun])

  async function loadDaftar() {
    setLoading(true)
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    const { data: karyawanProyek } = await supabase.from('absen_karyawan').select('id').eq('kode_proyek', activeKode)
    const kIds = (karyawanProyek || []).map(k => k.id)

    if (kIds.length === 0) {
      setDaftar([])
      setLoading(false)
      return
    }

    let q = supabase
      .from('absen_daftar_lembur')
      .select('*, absen_karyawan(nama, jabatan, atasan_id)')
      .in('karyawan_id', kIds)
      .order('tanggal', { ascending: false })
      .order('created_at', { ascending: true })

    if (viewMode === 'date') {
      q = q.eq('tanggal', tanggal)
    } else {
      const startDate = `${tahun}-${String(bulan).padStart(2, '0')}-01`
      const endDate = bulan === 12 ? `${tahun + 1}-01-01` : `${tahun}-${String(bulan + 1).padStart(2, '0')}-01`
      q = q.gte('tanggal', startDate).lt('tanggal', endDate)
    }

    const { data } = await q
    setDaftar(data || [])
    setLoading(false)
  }

  async function openAddModal() {
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'
    const { data } = await supabase
      .from('absen_karyawan')
      .select('id, nama, jabatan')
      .eq('kode_proyek', activeKode)
      .eq('status_aktif', true)
      .order('nama')
    setAllKaryawan(data || [])
    setSelected([])
    setSearchAdd('')
    setCatatan('')
    setShowAdd(true)
  }

  const registeredIds = daftar.filter(d => d.tanggal === tanggal).map(d => d.karyawan_id)
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
      {/* Top Filter Bar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Mode Switcher */}
          <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('date')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'date' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-300 hover:text-white'
              }`}
            >
              Per Tanggal
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'month' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-300 hover:text-white'
              }`}
            >
              Rekap Sebulan ({namaBulan[bulan]} {tahun})
            </button>
          </div>

          {viewMode === 'date' ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={tanggal}
                onChange={e => setTanggal(e.target.value)}
                className="input-field text-sm py-1.5"
              />
              <span className="text-sm font-semibold text-slate-300">{tglLabel}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select value={bulan} onChange={e => setBulan(+e.target.value)} className="select-field text-sm py-1.5">
                {namaBulan.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
              </select>
              <select value={tahun} onChange={e => setTahun(+e.target.value)} className="select-field text-sm py-1.5">
                {Array.from({ length: new Date().getFullYear() - 2024 + 3 }, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}
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
          <button onClick={openAddModal} className="btn-primary flex items-center gap-2 text-sm font-bold">
            <Plus size={16} /> Tambah Karyawan Lembur
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="card">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-cyan-500" />
            <span className="text-sm font-bold text-gray-900">
              Daftar Karyawan Lembur {viewMode === 'date' ? `(${tanggal})` : `(${namaBulan[bulan]} ${tahun})`}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs font-bold">
            {pendingCount > 0 && <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{pendingCount} pending</span>}
            {approvedCount > 0 && <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{approvedCount} approved</span>}
            <span className="text-gray-500">{daftar.length} total</span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : daftar.length === 0 ? (
          <div className="px-5 py-12 text-center text-gray-400">
            <Users size={36} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-bold text-gray-700">Belum Ada Karyawan Terdaftar Lembur</p>
            <p className="text-xs text-gray-500 mt-1">
              {viewMode === 'date' ? `Tidak ada pendaftaran lembur pada tanggal ${tanggal}` : `Tidak ada pendaftaran lembur pada bulan ${namaBulan[bulan]} ${tahun}`}
            </p>
            <button onClick={openAddModal} className="mt-3 px-4 py-2 bg-cyan-600 text-white font-bold text-xs rounded-xl shadow-md">
              + Tambah Karyawan Lembur
            </button>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="text-left px-5 py-3">Nama Karyawan</th>
                  {viewMode === 'month' && <th className="text-center px-4 py-3">Tanggal</th>}
                  <th className="text-left px-4 py-3">Jabatan</th>
                  <th className="text-left px-4 py-3">Catatan</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-center px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {daftar.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 font-semibold text-gray-900">{d.absen_karyawan?.nama}</td>
                    {viewMode === 'month' && (
                      <td className="px-4 py-3 text-center text-gray-700 font-mono font-bold whitespace-nowrap">
                        {d.tanggal}
                      </td>
                    )}
                    <td className="px-4 py-3 text-gray-600">{d.absen_karyawan?.jabatan || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{d.catatan || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge text-xs font-bold ${statusColor[d.status] || ''}`}>
                        {statusLabel[d.status] || d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {canApprove && d.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleApproveOne(d.id, 'APPROVED')}
                              disabled={processing === d.id}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-500/10 rounded-lg transition-colors font-bold text-xs flex items-center gap-1"
                              title="Approve"
                            >
                              <CheckCircle size={15} /> Approve
                            </button>
                            <button
                              onClick={() => handleApproveOne(d.id, 'REJECTED')}
                              disabled={processing === d.id}
                              className="p-1.5 text-rose-600 hover:bg-rose-500/10 rounded-lg transition-colors font-bold text-xs flex items-center gap-1"
                              title="Reject"
                            >
                              <XCircle size={15} /> Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleRemove(d)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Hapus"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Tambah Karyawan */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 text-slate-100 rounded-3xl p-6 max-w-lg w-full space-y-4 border border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base">Mendaftarkan Karyawan Lembur ({tanggal})</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 text-slate-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchAdd}
                  onChange={e => setSearchAdd(e.target.value)}
                  placeholder="Cari nama karyawan..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{selected.length} karyawan dipilih</span>
                <button onClick={selectAll} className="text-cyan-400 font-bold hover:underline">
                  {selected.length === filteredAdd.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-800 rounded-2xl p-2 bg-slate-950/60 custom-scrollbar">
                {filteredAdd.map(k => {
                  const isSel = selected.includes(k.id)
                  return (
                    <button
                      key={k.id}
                      onClick={() => toggleSelect(k.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${
                        isSel
                          ? 'bg-cyan-950/90 border-2 border-cyan-400 shadow-sm shadow-cyan-950'
                          : 'bg-slate-900/80 border border-slate-800/80 hover:bg-slate-800/90'
                      }`}
                    >
                      <div>
                        <div className={`text-xs font-bold ${isSel ? 'text-cyan-100' : 'text-slate-100'}`}>
                          {k.nama}
                        </div>
                        <div className={`text-[10px] ${isSel ? 'text-cyan-300 font-medium' : 'text-slate-400'}`}>
                          {k.jabatan || '-'}
                        </div>
                      </div>
                      {isSel && <CheckCircle size={18} className="text-cyan-400 shrink-0" />}
                    </button>
                  )
                })}
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Catatan Lembur (Opsional)</label>
                <input
                  value={catatan}
                  onChange={e => setCatatan(e.target.value)}
                  placeholder="Contoh: Pekerjaan Cor Beton / Pemasangan Bekisting..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-800">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-colors">
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={selected.length === 0 || submitting}
                  className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-colors"
                >
                  {submitting ? 'Mendaftarkan...' : `Daftarkan ${selected.length} Karyawan`}
                </button>
              </div>
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
  const [search, setSearch] = useState('')
  const [subTab, setSubTab] = useState('semua') // 'semua' | 'pending' | 'proses' | 'riwayat'

  const [editModalItem, setEditModalItem] = useState(null)
  const [editSubmitting, setEditSubmitting] = useState(false)

  useEffect(() => { load() }, [subTab, bulan, tahun])

  async function load() {
    setLoading(true)
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    const { data: karyawanProyek } = await supabase.from('absen_karyawan').select('id').eq('kode_proyek', activeKode)
    const kIds = (karyawanProyek || []).map(k => k.id)

    if (kIds.length === 0) {
      setData([])
      setLoading(false)
      return
    }

    const startDate = `${tahun}-${String(bulan).padStart(2, '0')}-01`
    const endDate = bulan === 12 ? `${tahun + 1}-01-01` : `${tahun}-${String(bulan + 1).padStart(2, '0')}-01`

    // Fetch 1) Harian records for month, 2) Daftar lembur for month, 3) Scan lembur for month, 4) Mandor map
    const [harianRes, daftarRes, scanRes, mandorRes, configRes] = await Promise.all([
      supabase
        .from('absen_harian')
        .select('*, absen_karyawan(nama, jabatan, atasan_id)')
        .in('karyawan_id', kIds)
        .gte('tanggal', startDate)
        .lt('tanggal', endDate)
        .order('tanggal', { ascending: false }),
      supabase
        .from('absen_daftar_lembur')
        .select('*, absen_karyawan(nama, jabatan, atasan_id)')
        .in('karyawan_id', kIds)
        .gte('tanggal', startDate)
        .lt('tanggal', endDate)
        .order('tanggal', { ascending: false }),
      supabase
        .from('absen_scan_wajah')
        .select('karyawan_id, tanggal, slot_id, waktu_scan, gps_lat, gps_lng, lokasi_kerja, absen_jadwal_slot(jenis, label)')
        .in('karyawan_id', kIds)
        .gte('tanggal', startDate)
        .lt('tanggal', endDate),
      supabase
        .from('absen_karyawan')
        .select('id, nama')
        .eq('kode_proyek', activeKode)
        .ilike('jabatan', '%mandor%')
        .eq('status_aktif', true),
      supabase.from('absen_konfigurasi').select('key, value')
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

    const harianList = harianRes.data || []
    const daftarList = daftarRes.data || []

    const daftarSet = new Set(daftarList.map(d => `${d.karyawan_id}_${d.tanggal}`))
    const daftarMapByKey = {}
    daftarList.forEach(d => {
      daftarMapByKey[`${d.karyawan_id}_${d.tanggal}`] = d
    })

    const lemburMulai = (cfgMap.lembur_mulai_hitung || '19:00').slice(0, 5)

    const mapByKey = {}

    // 1. Process harian records ONLY IF they have overtime activity or are registered/scanned for overtime
    harianList.forEach(h => {
      const key = `${h.karyawan_id}_${h.tanggal}`
      const scans = scanMap[key] || []
      const offsiteScan = scans.find(s => s.isOffsite)
      const isRegistered = daftarSet.has(key)
      const hasOvertimeScan = scans.some(s =>
        s.absen_jadwal_slot?.jenis === 'lembur' ||
        s.absen_jadwal_slot?.jenis === 'pulang_lembur' ||
        (s.absen_jadwal_slot?.label || '').toLowerCase().includes('lembur')
      )

      let displayStatus = 'NONE'
      if (h.status_lembur === 'PENDING_APPROVAL') displayStatus = 'PENDING'
      else if (h.status_lembur === 'APPROVED') displayStatus = 'APPROVED'
      else if (h.status_lembur === 'REJECTED') displayStatus = 'REJECTED'
      else if (isRegistered || hasOvertimeScan) displayStatus = 'PROSES'

      // Only include if worker has overtime activity/registration
      if (displayStatus !== 'NONE') {
        const regInfo = daftarMapByKey[key]

        // Determine valid overtime clock-out time (must be > lemburMulai e.g. > 19:00)
        const scanPulangLembur = scans.find(s => {
          const jam = s.waktu_scan?.slice(11, 16)
          return jam && jam >= lemburMulai
        })

        let jamPulangLembur = null
        if (h.jam_pulang && h.jam_pulang.slice(0, 5) > lemburMulai) {
          jamPulangLembur = h.jam_pulang.slice(0, 5)
        } else if (scanPulangLembur) {
          jamPulangLembur = scanPulangLembur.waktu_scan.slice(11, 16)
        }

        mapByKey[key] = {
          ...h,
          displayStatus,
          jamPulangLembur,
          catatan: h.catatan || regInfo?.catatan || null,
          scans,
          isOffsite: !!offsiteScan,
          offsiteDist: offsiteScan?.distanceMeters || 0
        }
      }
    })

    // 2. Also include registered workers from daftarList who don't have a harian record yet
    daftarList.forEach(d => {
      const key = `${d.karyawan_id}_${d.tanggal}`
      if (!mapByKey[key]) {
        const scans = scanMap[key] || []
        const offsiteScan = scans.find(s => s.isOffsite)
        const scanPulangLembur = scans.find(s => {
          const jam = s.waktu_scan?.slice(11, 16)
          return jam && jam >= lemburMulai
        })

        mapByKey[key] = {
          id: `virtual_${d.id}`,
          karyawan_id: d.karyawan_id,
          tanggal: d.tanggal,
          jam_masuk: scans.find(s => s.absen_jadwal_slot?.jenis === 'masuk')?.waktu_scan?.slice(11, 16) || null,
          jam_pulang: null,
          jamPulangLembur: scanPulangLembur ? scanPulangLembur.waktu_scan.slice(11, 16) : null,
          jam_lembur: 0,
          status_lembur: 'PROSES',
          displayStatus: 'PROSES',
          catatan: d.catatan || 'Terdaftar Lembur',
          absen_karyawan: d.absen_karyawan,
          scans,
          isOffsite: !!offsiteScan,
          offsiteDist: offsiteScan?.distanceMeters || 0
        }
      }
    })

    // Filter by subTab
    let allItems = Object.values(mapByKey).sort((a, b) => b.tanggal.localeCompare(a.tanggal))

    if (subTab === 'pending') {
      allItems = allItems.filter(item => item.displayStatus === 'PENDING')
    } else if (subTab === 'proses') {
      allItems = allItems.filter(item => item.displayStatus === 'PROSES')
    } else if (subTab === 'riwayat') {
      allItems = allItems.filter(item => item.displayStatus === 'APPROVED' || item.displayStatus === 'REJECTED')
    }
    // subTab === 'semua' includes all

    setData(allItems)
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
      jam_pulang: d.jamPulangLembur || 'Belum Scan Pulang Lembur',
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
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-1.5 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 overflow-x-auto">
          <button
            onClick={() => setSubTab('semua')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 ${
              subTab === 'semua' ? 'bg-cyan-500 text-slate-950 shadow-md font-black' : 'text-slate-300 hover:text-white'
            }`}
          >
            <ClipboardList size={14} /> Rekap Sebulan ({data.length})
          </button>
          <button
            onClick={() => setSubTab('pending')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 ${
              subTab === 'pending' ? 'bg-amber-400 text-slate-950 shadow-md font-black' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Clock size={14} /> Menunggu Approval
          </button>
          <button
            onClick={() => setSubTab('proses')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 ${
              subTab === 'proses' ? 'bg-emerald-400 text-slate-950 shadow-md font-black' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Activity size={14} className="animate-pulse" /> Sedang Lembur (Belum Pulang)
          </button>
          <button
            onClick={() => setSubTab('riwayat')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 ${
              subTab === 'riwayat' ? 'bg-cyan-400 text-slate-950 shadow-md font-black' : 'text-slate-300 hover:text-white'
            }`}
          >
            <CheckCircle2 size={14} /> Riwayat Selesai
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select value={bulan} onChange={e => setBulan(+e.target.value)} className="select-field text-sm py-1.5 font-bold">
            {namaBulan.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
          </select>
          <select value={tahun} onChange={e => setTahun(+e.target.value)} className="select-field text-sm py-1.5 font-bold">
            {Array.from({ length: new Date().getFullYear() - 2024 + 3 }, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama karyawan..." className="input-field pl-10" />
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
                  <th className="text-left px-5 py-3">Nama Pekerja</th>
                  <th className="text-center px-4 py-3">Tanggal</th>
                  <th className="text-center px-4 py-3">Jam Pulang</th>
                  <th className="text-center px-4 py-3">Jam Lembur</th>
                  <th className="text-center px-4 py-3">Status & Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grouped.map(([groupName, items]) => (
                  <Fragment key={groupName}>
                    <tr className="table-group-header">
                      <td colSpan={5} className="px-5 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-700 uppercase tracking-wide">{groupName}</span>
                          <span className="text-xs font-bold text-slate-500">{items.length} data</span>
                        </div>
                      </td>
                    </tr>
                    {items.map(d => (
                      <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3 font-semibold text-gray-900">
                          <div>{d.absen_karyawan?.nama}</div>
                          {d.isOffsite && (
                            <div className="mt-1">
                              <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-700 font-bold text-[10px] border border-rose-400 inline-flex items-center gap-1">
                                <AlertTriangle size={11} /> Off-Site ({formatDistance(d.offsiteDist)})
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700 font-mono font-bold whitespace-nowrap">
                          {new Date(d.tanggal + 'T00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700 font-mono font-bold">
                          {d.jamPulangLembur ? (
                            <span className="text-emerald-700 font-mono font-bold">{d.jamPulangLembur}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-cyan-700 font-bold text-xs">
                              <Activity size={12} className="animate-pulse text-cyan-600" /> Belum Pulang
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1.5 text-orange-600 font-bold">
                            <Clock size={14} /> {d.jam_lembur || 0} jam
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {d.displayStatus === 'PENDING' ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenModal(d, false)}
                                className="btn-success py-1 px-2.5 text-xs flex items-center gap-1 font-bold"
                              >
                                <Check size={13} /> Approve / Koreksi
                              </button>
                              <button
                                onClick={() => handleOpenModal(d, true)}
                                className="btn-danger py-1 px-2.5 text-xs flex items-center gap-1 font-bold"
                              >
                                <X size={13} /> Reject
                              </button>
                            </div>
                          ) : d.displayStatus === 'PROSES' ? (
                            <span className="badge bg-cyan-100 text-cyan-800 border border-cyan-300 font-bold text-xs inline-flex items-center gap-1">
                              <Activity size={12} className="animate-pulse text-cyan-600" /> Sedang Lembur (Belum Pulang)
                            </span>
                          ) : (
                            <div>
                              <span className={`badge font-bold text-xs inline-flex items-center gap-1 ${d.displayStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                {d.displayStatus === 'APPROVED' ? (
                                  <><CheckCircle2 size={12} className="text-emerald-600" /> Approved</>
                                ) : (
                                  <><XCircle size={12} className="text-rose-600" /> Rejected</>
                                )}
                              </span>
                              {d.catatan && <div className="text-xs text-gray-500 mt-1 font-medium">{d.catatan}</div>}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                    <Clock size={36} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-sm font-bold text-gray-700">Tidak ada data lembur untuk kategori ini</p>
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
