import { useEffect, useState, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { Check, X, Clock, Search } from 'lucide-react'

const namaBulan = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

export default function ApprovalLembur() {
  const now = new Date()
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())
  const [data, setData] = useState([])
  const [mandorMap, setMandorMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(null)
  const [rejectId, setRejectId] = useState(null)
  const [catatan, setCatatan] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('pending')

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

    const [harianRes, mandorRes] = await Promise.all([
      q,
      supabase.from('absen_karyawan').select('id, nama').ilike('jabatan', '%mandor%').eq('status_aktif', true),
    ])
    setData(harianRes.data || [])
    const mMap = {}
    ;(mandorRes.data || []).forEach(m => { mMap[m.id] = m.nama })
    setMandorMap(mMap)
    setLoading(false)
  }

  async function approve(id) {
    setProcessing(id)
    await supabase.rpc('absen_approve_lembur', { p_absensi_id: id, p_status: 'APPROVED' })
    setProcessing(null)
    load()
  }

  async function reject(id) {
    if (!catatan.trim()) return
    setProcessing(id)
    await supabase.rpc('absen_approve_lembur', { p_absensi_id: id, p_status: 'REJECTED', p_catatan: catatan })
    setProcessing(null)
    setRejectId(null)
    setCatatan('')
    load()
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
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="page-title">Approval Lembur</h1>
          <div className="flex gap-1 bg-white/10 p-0.5 rounded-lg">
            <button onClick={() => setTab('pending')} className={`px-4 py-1.5 rounded-md text-sm transition-all duration-150 ${tab === 'pending' ? 'bg-blue-500 text-white font-semibold shadow-md' : 'text-slate-300 font-medium hover:text-white'}`}>
              Pending
            </button>
            <button onClick={() => setTab('history')} className={`px-4 py-1.5 rounded-md text-sm transition-all duration-150 ${tab === 'history' ? 'bg-blue-500 text-white font-semibold shadow-md' : 'text-slate-300 font-medium hover:text-white'}`}>
              Riwayat
            </button>
          </div>
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
                    <th className="text-center px-4 py-3">Aksi</th>
                  ) : (
                    <th className="text-center px-4 py-3">Status</th>
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
                        <td className="px-5 py-3 font-medium text-gray-900">{d.absen_karyawan?.nama}</td>
                        <td className="px-4 py-3 text-center text-gray-600 whitespace-nowrap">{new Date(d.tanggal + 'T00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{d.jam_pulang?.slice(0, 5)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center gap-1.5 text-orange-600 font-medium">
                            <Clock size={14} /> {d.jam_lembur} jam
                          </span>
                        </td>
                        {tab === 'pending' ? (
                          <td className="px-4 py-3 text-center">
                            {rejectId === d.id ? (
                              <div className="flex items-center gap-2">
                                <input value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="Alasan reject..." className="input-field text-xs py-1.5 flex-1" />
                                <button onClick={() => reject(d.id)} disabled={!catatan.trim()} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 transition-colors"><Check size={16} /></button>
                                <button onClick={() => { setRejectId(null); setCatatan('') }} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"><X size={16} /></button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={() => approve(d.id)} disabled={processing === d.id} className="btn-success py-1.5 px-3 text-xs">Approve</button>
                                <button onClick={() => setRejectId(d.id)} className="btn-danger py-1.5 px-3 text-xs">Reject</button>
                              </div>
                            )}
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
      </div>
    </div>
  )
}
