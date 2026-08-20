import { useEffect, useState, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { Shield, ChevronLeft, ChevronRight, Search, Layers, FileText, ChevronDown, ChevronUp } from 'lucide-react'

const entityLabel = {
  absen_karyawan: 'Karyawan',
  absen_harian: 'Absensi Harian',
  absen_konfigurasi: 'Konfigurasi',
  absen_periode_gaji: 'Periode Gaji',
  absen_gaji_bulanan: 'Gaji Bulanan',
  absen_tutup_bulan: 'Tutup Absen Bulanan',
}

const actionColor = {
  INSERT: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  UPDATE: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  DELETE: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  IMPORT: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
}

export default function AuditLog() {
  const [data, setData] = useState([])
  const [userMap, setUserMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [filterEntity, setFilterEntity] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [search, setSearch] = useState('')
  const [expandedBatchId, setExpandedBatchId] = useState(null)
  const pageSize = 100 // Fetch 100 items per query for smooth batch consolidation

  useEffect(() => {
    supabase.from('absen_user_profiles').select('id, nama').then(({ data }) => {
      const m = {}
      ;(data || []).forEach(u => { m[u.id] = u.nama })
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

  const getUserName = (actorId) => userMap[actorId] || actorId?.slice(0, 8) || 'Sistem / Admin'

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

  // Consolidate contiguous batch logs into single grouped rows
  const groupedList = useMemo(() => {
    if (!filtered || filtered.length === 0) return []

    const groups = []
    let currentBatch = null

    filtered.forEach((item) => {
      const timeMs = new Date(item.created_at).getTime()

      if (!currentBatch) {
        currentBatch = {
          id: item.id,
          actor_id: item.actor_id,
          action: item.action,
          entity: item.entity,
          created_at: item.created_at,
          timeMs,
          items: [item]
        }
      } else {
        const isSameActor = currentBatch.actor_id === item.actor_id
        const isSameAction = currentBatch.action === item.action
        const isSameEntity = currentBatch.entity === item.entity
        const isWithinTime = Math.abs(currentBatch.timeMs - timeMs) <= 60000 // Group logs within 60 seconds

        if (isSameActor && isSameAction && isSameEntity && isWithinTime) {
          currentBatch.items.push(item)
        } else {
          groups.push(currentBatch)
          currentBatch = {
            id: item.id,
            actor_id: item.actor_id,
            action: item.action,
            entity: item.entity,
            created_at: item.created_at,
            timeMs,
            items: [item]
          }
        }
      }
    })

    if (currentBatch) {
      groups.push(currentBatch)
    }

    return groups
  }, [filtered])

  return (
    <div>
      {/* Header Page */}
      <div className="page-header">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Shield className="text-cyan-400" size={24} />
              <span>Audit Log & System History</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Riwayat audit aktivitas sistem dengan sistem konsolidasi update batch otomatis.
            </p>
          </div>

          <div className="flex gap-2">
            <select
              value={filterEntity}
              onChange={e => { setFilterEntity(e.target.value); setPage(0) }}
              className="select-field text-xs py-1.5"
            >
              <option value="">Semua Entitas</option>
              {Object.entries(entityLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select
              value={filterAction}
              onChange={e => { setFilterAction(e.target.value); setPage(0) }}
              className="select-field text-xs py-1.5"
            >
              <option value="">Semua Aksi</option>
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="IMPORT">IMPORT</option>
            </select>
          </div>
        </div>
      </div>

      <div className="main-content">
        <div className="card">
          <div className="p-4 border-b border-slate-800">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari user, entitas, atau aksi audit..."
                className="input-field pl-10 text-xs py-2 bg-slate-950/80 border-slate-800"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="table-scroll">
                <table className="w-full text-xs">
                  <thead className="table-header">
                    <tr>
                      <th className="text-left px-5 py-3">Waktu</th>
                      <th className="text-left px-4 py-3">User</th>
                      <th className="text-center px-4 py-3">Aksi</th>
                      <th className="text-left px-4 py-3">Entitas</th>
                      <th className="text-center px-4 py-3">Detail & Item</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {groupedList.map(g => {
                      const isBatch = g.items.length > 1
                      const isExpanded = expandedBatchId === g.id
                      const primaryItem = g.items[0]

                      return (
                        <Fragment key={g.id}>
                          <tr className={`hover:bg-slate-800/40 transition-colors ${isExpanded ? 'bg-slate-800/50' : ''}`}>
                            <td className="px-5 py-3 text-slate-400 whitespace-nowrap font-mono">
                              {new Date(g.created_at).toLocaleString('id-ID')}
                            </td>
                            <td className="px-4 py-3 font-bold text-white">
                              {getUserName(g.actor_id)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="inline-flex items-center justify-center gap-1.5">
                                <span className={`px-2.5 py-0.5 rounded-lg border text-[10px] font-extrabold ${actionColor[g.action] || 'bg-slate-800 text-slate-300'}`}>
                                  {g.action}
                                </span>
                                {isBatch && (
                                  <span className="px-2 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 text-[10px] font-black flex items-center gap-1 shadow-sm">
                                    <Layers size={11} /> BATCH ({g.items.length})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-300 font-medium">
                              {entityLabel[g.entity] || g.entity}
                              {isBatch && (
                                <span className="text-[11px] text-slate-400 block font-normal mt-0.5">
                                  {g.items.length} baris data diproses bersamaan
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => setExpandedBatchId(isExpanded ? null : g.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                              >
                                <span>{isBatch ? `Detail Batch (${g.items.length})` : 'Detail'}</span>
                                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Detail Panel */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={5} className="px-5 py-4 bg-slate-950/80 border-t border-b border-slate-800">
                                <div className="space-y-3 font-sans">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-bold text-cyan-300 text-xs flex items-center gap-1.5">
                                      <FileText size={14} /> Rincian Perubahan Data Audit
                                      {isBatch && <span className="text-slate-400 font-normal">({g.items.length} Item pada transaksi batch ini)</span>}
                                    </h4>
                                  </div>

                                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                                    {g.items.map((item, idx) => (
                                      <div key={item.id || idx} className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-2 text-xs">
                                        {isBatch && (
                                          <div className="font-bold text-slate-300 text-[11px] border-b border-slate-800 pb-1 flex justify-between">
                                            <span>Item #{idx + 1}</span>
                                            <span className="text-slate-500 font-mono">{new Date(item.created_at).toLocaleTimeString('id-ID')}</span>
                                          </div>
                                        )}

                                        {item.action === 'IMPORT' && item.new_value ? (
                                          <div className="space-y-1 text-slate-300">
                                            <div><span className="text-slate-400">Nama File:</span> {item.new_value.nama_file}</div>
                                            <div><span className="text-slate-400">Jumlah Baris:</span> {item.new_value.jumlah_baris}</div>
                                            <div><span className="text-slate-400">Data Baru / Diperbarui:</span> {item.new_value.inserted ?? 0} baru / {item.new_value.updated ?? 0} update</div>
                                          </div>
                                        ) : (
                                          <div className="grid md:grid-cols-2 gap-3">
                                            {item.old_value && (
                                              <div>
                                                <div className="text-[11px] font-bold text-slate-400 mb-1">Nilai Sebelum:</div>
                                                <pre className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-36">
                                                  {JSON.stringify(item.old_value, null, 2)}
                                                </pre>
                                              </div>
                                            )}
                                            {item.new_value && (
                                              <div>
                                                <div className="text-[11px] font-bold text-emerald-400 mb-1">Nilai Sesudah:</div>
                                                <pre className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-36">
                                                  {JSON.stringify(item.new_value, null, 2)}
                                                </pre>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}

                    {groupedList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                          <Shield size={32} className="mx-auto text-slate-600 mb-2" />
                          <span>{search.trim() ? 'Tidak ada data log yang cocok dengan pencarian.' : 'Belum ada riwayat audit log.'}</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-5 py-4 border-t border-slate-800 flex items-center justify-between">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-30 flex items-center gap-1"
                >
                  <ChevronLeft size={14} /> Sebelumnya
                </button>
                <span className="text-xs text-slate-400 font-medium">Halaman {page + 1}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={data.length < pageSize}
                  className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-30 flex items-center gap-1"
                >
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
