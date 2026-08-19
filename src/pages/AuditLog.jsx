import { useEffect, useState, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { Shield, ChevronLeft, ChevronRight, Search } from 'lucide-react'

const entityLabel = {
  absen_karyawan: 'Karyawan',
  absen_harian: 'Absensi Harian',
  absen_konfigurasi: 'Konfigurasi',
  absen_periode_gaji: 'Periode Gaji',
  absen_gaji_bulanan: 'Gaji Bulanan',
}

const actionColor = {
  INSERT: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-blue-100 text-blue-700',
  DELETE: 'bg-red-100 text-red-700',
  IMPORT: 'bg-purple-100 text-purple-700',
}

export default function AuditLog() {
  const [data, setData] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [filterEntity, setFilterEntity] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null)
  const pageSize = 20

  useEffect(() => {
    supabase.from('absen_user_profiles').select('user_id, nama').then(({ data }) => {
      const m = {}
      ;(data || []).forEach(u => { m[u.user_id] = u.nama })
      setUserMap(m)
    })
  }, [])

  useEffect(() => { load() }, [page, filterEntity, filterAction])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('absen_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (filterEntity) q = q.eq('entity', filterEntity)
    if (filterAction) q = q.eq('action', filterAction)

    const { data } = await q
    setData(data || [])
    setLoading(false)
  }

  const getUserName = (actorId) => userMap[actorId] || actorId?.slice(0, 8) || '-'

  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter(d => {
      const userName = getUserName(d.actor_id).toLowerCase()
      const entity = (entityLabel[d.entity] || d.entity || '').toLowerCase()
      const action = (d.action || '').toLowerCase()
      return userName.includes(q) || entity.includes(q) || action.includes(q)
    })
  }, [data, search, userMap])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="text-gray-500 text-xs mt-0.5">Riwayat perubahan data sistem</p>
        </div>
        <div className="flex gap-2">
          <select value={filterEntity} onChange={e => { setFilterEntity(e.target.value); setPage(0) }} className="select-field text-sm py-1.5">
            <option value="">Semua Entitas</option>
            {Object.entries(entityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(0) }} className="select-field text-sm py-1.5">
            <option value="">Semua Aksi</option>
            <option value="INSERT">INSERT</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="IMPORT">IMPORT</option>
          </select>
        </div>
      </div>

      <div className="main-content">
      <div className="card">
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari user, entitas, atau aksi..." className="input-field pl-10" />
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    <th className="text-left px-5 py-3">Waktu</th>
                    <th className="text-left px-4 py-3">User</th>
                    <th className="text-center px-4 py-3">Aksi</th>
                    <th className="text-left px-4 py-3">Entitas</th>
                    <th className="text-center px-4 py-3">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(d => (
                    <Fragment key={d.id}>
                      <tr className={`hover:bg-gray-50/50 transition-colors ${expanded === d.id ? 'bg-gray-50/50' : ''}`}>
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">{new Date(d.created_at).toLocaleString('id-ID')}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{getUserName(d.actor_id)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`badge ${actionColor[d.action] || 'bg-gray-100'}`}>{d.action}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{entityLabel[d.entity] || d.entity}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                            {expanded === d.id ? 'Tutup' : 'Detail'}
                          </button>
                        </td>
                      </tr>
                      {expanded === d.id && (
                        <tr>
                          <td colSpan={5} className="px-5 pb-4 pt-0 bg-gray-50/50">
                            {d.action === 'IMPORT' && d.new_value ? (
                              <div className="text-xs space-y-2">
                                <div className="font-semibold text-gray-600 mb-1.5">Detail Import:</div>
                                <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-1.5 text-gray-600">
                                  <div><span className="font-medium">File:</span> {d.new_value.nama_file}</div>
                                  <div><span className="font-medium">Jumlah baris:</span> {d.new_value.jumlah_baris}</div>
                                  <div><span className="font-medium">Data baru:</span> {d.new_value.inserted ?? '-'} | <span className="font-medium">Diperbarui:</span> {d.new_value.updated ?? '-'}</div>
                                  <div><span className="font-medium">Periode:</span> {d.new_value.tanggal_mulai} s/d {d.new_value.tanggal_akhir}</div>
                                  {d.new_value.uid_tidak_dikenal?.length > 0 && (
                                    <div><span className="font-medium text-amber-600">UID tidak dikenal:</span> {d.new_value.uid_tidak_dikenal.join(', ')}</div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="grid md:grid-cols-2 gap-4 text-xs">
                                {d.old_value && (
                                  <div>
                                    <div className="font-semibold text-gray-600 mb-1.5">Nilai Lama:</div>
                                    <pre className="bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto max-h-40 text-gray-600">{JSON.stringify(d.old_value, null, 2)}</pre>
                                  </div>
                                )}
                                {d.new_value && (
                                  <div>
                                    <div className="font-semibold text-gray-600 mb-1.5">Nilai Baru:</div>
                                    <pre className="bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto max-h-40 text-gray-600">{JSON.stringify(d.new_value, null, 2)}</pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400">
                      <Shield size={32} className="mx-auto text-gray-300 mb-2" />
                      {search.trim() ? 'Tidak ditemukan' : 'Tidak ada log'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-30">
                <ChevronLeft size={14} /> Sebelumnya
              </button>
              <span className="text-sm text-gray-500 font-medium">Halaman {page + 1}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={data.length < pageSize} className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-30">
                Selanjutnya <ChevronRight size={14} />
              </button>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  )
}
