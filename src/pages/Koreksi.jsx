import { useEffect, useState, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { FileEdit, X, AlertCircle, Search } from 'lucide-react'
import { getActiveProject } from './PilihProyek'

const namaBulan = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

const statusLabel = {
  TANPA_PULANG: 'Tanpa Pulang',
  TANPA_MASUK: 'Tanpa Masuk',
  HANYA_SCAN_TENGAH: 'Scan Tengah',
  INSIDEN: 'Insiden',
  IZIN_BERBAYAR: 'Izin Berbayar',
  IZIN_TIDAK_BERBAYAR: 'Izin Tidak Berbayar',
  LAPORAN_DITERIMA: 'Laporan Diterima',
}

const statusColor = {
  TANPA_PULANG: 'bg-amber-100 text-amber-700',
  TANPA_MASUK: 'bg-amber-100 text-amber-700',
  HANYA_SCAN_TENGAH: 'bg-orange-100 text-orange-700',
  INSIDEN: 'bg-red-100 text-red-700',
  IZIN_BERBAYAR: 'bg-cyan-100 text-cyan-700',
  IZIN_TIDAK_BERBAYAR: 'bg-slate-100 text-slate-600',
  LAPORAN_DITERIMA: 'bg-blue-100 text-blue-700',
}

const alasanOptions = [
  'Lupa scan',
  'Mesin error',
  'Tugas luar',
  'Izin setengah hari',
  'Kartu rusak',
  'Lainnya',
]

export default function Koreksi() {
  const now = new Date()
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())
  const [data, setData] = useState([])
  const [mandorMap, setMandorMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ jam_masuk: '', jam_pulang: '', alasan: '', catatan: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [kuotaInfo, setKuotaInfo] = useState(null)

  useEffect(() => {
    load()
    const handleStorage = () => load()
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [bulan, tahun])

  async function load() {
    setLoading(true)
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    // Filter karyawan by active project code
    const { data: karyawanProyek } = await supabase
      .from('absen_karyawan')
      .select('id')
      .eq('kode_proyek', activeKode)

    const kIds = (karyawanProyek || []).map(k => k.id)
    if (kIds.length === 0) {
      setData([])
      setMandorMap({})
      setLoading(false)
      return
    }

    const startDate = `${tahun}-${String(bulan).padStart(2, '0')}-01`
    const endDate = bulan === 12 ? `${tahun + 1}-01-01` : `${tahun}-${String(bulan + 1).padStart(2, '0')}-01`

    const [harianRes, mandorRes] = await Promise.all([
      supabase
        .from('absen_harian')
        .select('*, absen_karyawan(nama, jabatan, atasan_id)')
        .in('karyawan_id', kIds)
        .in('status', ['TANPA_PULANG','TANPA_MASUK','HANYA_SCAN_TENGAH','INSIDEN'])
        .gte('tanggal', startDate)
        .lt('tanggal', endDate)
        .order('tanggal', { ascending: false }),
      supabase
        .from('absen_karyawan')
        .select('id, nama')
        .eq('kode_proyek', activeKode)
        .ilike('jabatan', '%mandor%')
        .eq('status_aktif', true),
    ])
    setData(harianRes.data || [])
    const mMap = {}
    ;(mandorRes.data || []).forEach(m => { mMap[m.id] = m.nama })
    setMandorMap(mMap)
    setLoading(false)
  }

  async function openKoreksi(row) {
    setSelected(row)
    setForm({
      jam_masuk: row.jam_masuk?.slice(0, 5) || '',
      jam_pulang: row.jam_pulang?.slice(0, 5) || '',
      alasan: '',
      catatan: '',
    })
    setError('')

    const { count } = await supabase
      .from('absen_koreksi_log')
      .select('*', { count: 'exact', head: true })
      .eq('karyawan_id', row.karyawan_id)
      .gte('tanggal', `${tahun}-${String(bulan).padStart(2,'0')}-01`)
      .lt('tanggal', bulan === 12 ? `${tahun+1}-01-01` : `${tahun}-${String(bulan+1).padStart(2,'0')}-01`)

    const { data: cfg } = await supabase.from('absen_konfigurasi').select('value').eq('key', 'kuota_koreksi').single()
    setKuotaInfo({ terpakai: count || 0, maks: parseInt(cfg?.value || '3') })
    setShowModal(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.alasan) { setError('Alasan wajib dipilih'); return }
    setSaving(true)
    setError('')

    const alasan = form.alasan === 'Lainnya' ? form.catatan : form.alasan
    const { error: rpcError } = await supabase.rpc('absen_koreksi_absensi', {
      p_absensi_id: selected.id,
      p_jam_masuk: form.jam_masuk || null,
      p_jam_pulang: form.jam_pulang || null,
      p_alasan: alasan,
    })

    if (rpcError) {
      setError(rpcError.message)
    } else {
      setShowModal(false)
      load()
    }
    setSaving(false)
  }

  const fmtDate = d => new Date(d + 'T00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

  const filtered = data.filter(d =>
    (d.absen_karyawan?.nama || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.absen_karyawan?.jabatan || '').toLowerCase().includes(search.toLowerCase())
  )

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
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="page-title">Koreksi Absensi</h1>
          <span className="badge bg-amber-500/20 text-amber-300">{data.length} perlu koreksi</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={bulan} onChange={e => setBulan(+e.target.value)} className="select-field text-sm py-1.5">
            {namaBulan.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
          </select>
          <select value={tahun} onChange={e => setTahun(+e.target.value)} className="select-field text-sm py-1.5">
            {Array.from({ length: new Date().getFullYear() - 2024 + 3 }, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="main-content">
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
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <FileEdit size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-gray-400">Tidak ada data yang perlu dikoreksi</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  <th className="text-left px-5 py-3">Tanggal</th>
                  <th className="text-left px-4 py-3">Nama</th>
                  <th className="text-left px-4 py-3">Jabatan</th>
                  <th className="text-center px-4 py-3">Masuk</th>
                  <th className="text-center px-4 py-3">Pulang</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-center px-4 py-3 w-24">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grouped.map(([groupName, items]) => (
                  <Fragment key={groupName}>
                    <tr className="table-group-header">
                      <td colSpan={7} className="px-5 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{groupName}</span>
                          <span className="text-xs text-slate-400">{items.length} data</span>
                        </div>
                      </td>
                    </tr>
                    {items.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtDate(row.tanggal)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{row.absen_karyawan?.nama}</td>
                        <td className="px-4 py-3 text-gray-500">{row.absen_karyawan?.jabatan || '-'}</td>
                        <td className="px-4 py-3 text-center text-gray-600 font-mono">{row.jam_masuk?.slice(0, 5) || '-'}</td>
                        <td className="px-4 py-3 text-center text-gray-600 font-mono">{row.jam_pulang?.slice(0, 5) || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`badge ${statusColor[row.status]}`}>{statusLabel[row.status]}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => openKoreksi(row)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            <FileEdit size={13} /> Koreksi
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && selected && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <span className="font-semibold text-gray-900">Koreksi Absensi</span>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 text-sm">
                <div className="font-semibold text-gray-900">{selected.absen_karyawan?.nama}</div>
                <div className="text-gray-500 mt-1">Tanggal: {fmtDate(selected.tanggal)}</div>
                <div className="text-gray-500">Scan asli — Masuk: {selected.jam_masuk?.slice(0,5) || '-'} | Pulang: {selected.jam_pulang?.slice(0,5) || '-'}</div>
                {kuotaInfo && (
                  <div className={`mt-2 text-xs font-medium ${kuotaInfo.terpakai >= kuotaInfo.maks ? 'text-red-600' : 'text-gray-500'}`}>
                    Kuota koreksi: {kuotaInfo.terpakai}/{kuotaInfo.maks} bulan ini
                  </div>
                )}
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-lg flex items-start gap-2">
                  <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Jam Masuk</label>
                  <input type="time" value={form.jam_masuk} onChange={e => setForm({...form, jam_masuk: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Jam Pulang</label>
                  <input type="time" value={form.jam_pulang} onChange={e => setForm({...form, jam_pulang: e.target.value})} className="input-field" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Alasan *</label>
                <select value={form.alasan} onChange={e => setForm({...form, alasan: e.target.value})} className="input-field" required>
                  <option value="">-- Pilih Alasan --</option>
                  {alasanOptions.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              {form.alasan === 'Lainnya' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Catatan *</label>
                  <textarea value={form.catatan} onChange={e => setForm({...form, catatan: e.target.value})} required className="input-field" rows={2} />
                </div>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Batal</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Menyimpan...' : 'Simpan Koreksi'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
