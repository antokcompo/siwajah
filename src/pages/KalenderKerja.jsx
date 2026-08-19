import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, RefreshCw, X, Calendar, Tag, FileText } from 'lucide-react'

const jenisColor = {
  kerja: '',
  minggu: '',
  libur_nasional: '',
  libur_perusahaan: '',
}

const jenisStyle = {
  kerja: { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' },
  minggu: { background: 'rgba(100,116,139,0.1)', borderColor: 'rgba(100,116,139,0.2)' },
  libur_nasional: { background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)' },
  libur_perusahaan: { background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.25)' },
}

const jenisLabel = {
  kerja: 'Hari Kerja',
  minggu: 'Minggu',
  libur_nasional: 'Libur Nasional',
  libur_perusahaan: 'Libur Perusahaan',
}

const jenisBadge = {
  kerja: 'bg-emerald-100 text-emerald-700',
  minggu: 'bg-gray-100 text-gray-600',
  libur_nasional: 'bg-red-100 text-red-700',
  libur_perusahaan: 'bg-amber-100 text-amber-700',
}

const jenisLegendColor = {
  kerja: 'bg-emerald-400',
  minggu: 'bg-gray-400',
  libur_nasional: 'bg-red-400',
  libur_perusahaan: 'bg-amber-400',
}

export default function KalenderKerja() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const [editModal, setEditModal] = useState(false)
  const [editData, setEditData] = useState(null)
  const [editForm, setEditForm] = useState({ jenis_hari: '', keterangan: '' })
  const [editSaving, setEditSaving] = useState(false)

  const bulan = currentDate.getMonth() + 1
  const tahun = currentDate.getFullYear()

  useEffect(() => { load() }, [bulan, tahun])

  async function load() {
    setLoading(true)
    setError('')
    const start = format(startOfMonth(currentDate), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentDate), 'yyyy-MM-dd')
    const { data, error: err } = await supabase.rpc('absen_list_kalender', { p_start: start, p_end: end })
    if (err) {
      const { data: fallback } = await supabase.from('absen_kalender').select('*').gte('tanggal', start).lte('tanggal', end).order('tanggal')
      setData(fallback || [])
    } else {
      setData(data || [])
    }
    setLoading(false)
  }

  async function generateMonth() {
    setGenerating(true)
    setError('')
    const { error: err } = await supabase.rpc('absen_generate_kalender', {
      p_tahun: tahun,
      p_bulan: bulan,
    })
    if (err) {
      setError('Gagal generate kalender: ' + err.message)
    }
    setGenerating(false)
    load()
  }

  function openEdit(tanggal, cal) {
    setEditData({ tanggal, ...cal })
    setEditForm({
      jenis_hari: cal.jenis_hari,
      keterangan: cal.keterangan || '',
    })
    setEditModal(true)
  }

  async function handleEditSave(e) {
    e.preventDefault()
    setEditSaving(true)
    setError('')

    const keterangan = editForm.jenis_hari === 'kerja' ? null : (editForm.keterangan || jenisLabel[editForm.jenis_hari])

    const { error: err } = await supabase.rpc('absen_update_kalender', {
      p_tanggal: editData.tanggal,
      p_jenis_hari: editForm.jenis_hari,
      p_keterangan: keterangan,
    })
    if (err) {
      setError('Gagal update: ' + err.message)
    }
    setEditSaving(false)
    setEditModal(false)
    load()
  }

  const calMap = data.reduce((m, d) => { m[d.tanggal] = d; return m }, {})
  const days = eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) })
  const hariKerja = data.filter(d => d.jenis_hari === 'kerja').length
  const hariLibur = data.filter(d => d.jenis_hari !== 'kerja').length

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Kalender Kerja</h1>
          <p className="text-gray-500 text-xs mt-0.5">Atur jadwal hari kerja dan libur</p>
        </div>
        <button onClick={generateMonth} disabled={generating} className="btn-primary text-xs">
          <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
          {generating ? 'Generating...' : 'Generate Bulan Ini'}
        </button>
      </div>

      <div className="main-content">
      {error && (
        <div className="bg-red-50 border border-red-200/80 text-red-700 rounded-xl p-4 mb-6 text-sm flex items-start gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="card">
        {/* Month navigator */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <button onClick={() => setCurrentDate(new Date(tahun, bulan-2, 1))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <div className="text-center">
            <span className="font-semibold text-gray-900 capitalize text-lg">{format(currentDate, 'MMMM yyyy', { locale: localeId })}</span>
            {data.length > 0 && (
              <div className="flex items-center justify-center gap-4 mt-1">
                <span className="text-xs text-emerald-600 font-medium">{hariKerja} hari kerja</span>
                <span className="text-xs text-red-500 font-medium">{hariLibur} hari libur</span>
              </div>
            )}
          </div>
          <button onClick={() => setCurrentDate(new Date(tahun, bulan, 1))} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            </div>
          ) : data.length === 0 ? (
            <div className="py-16 text-center">
              <Calendar size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Kalender belum di-generate</p>
              <p className="text-gray-400 text-sm mt-1">Klik tombol "Generate Bulan Ini" untuk memulai</p>
            </div>
          ) : (
            <>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                {['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(d => <div key={d} className="py-1.5">{d}</div>)}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: getDay(startOfMonth(currentDate)) }).map((_, i) => <div key={`e${i}`} />)}
                {days.map(day => {
                  const ds = format(day, 'yyyy-MM-dd')
                  const cal = calMap[ds]
                  const isHoliday = cal?.jenis_hari === 'minggu' || cal?.jenis_hari?.startsWith('libur')
                  return (
                    <button
                      key={ds}
                      onClick={() => cal && openEdit(ds, cal)}
                      className="rounded-lg flex flex-col items-center justify-center py-2.5 sm:py-3 text-sm transition-all duration-150 cursor-pointer hover:brightness-125"
                      style={{
                        ...(cal ? jenisStyle[cal.jenis_hari] : { background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }),
                        border: '1px solid',
                        ...(isHoliday ? { boxShadow: '0 0 0 1px rgba(239,68,68,0.2)' } : {}),
                      }}
                      title={cal?.keterangan || ''}
                    >
                      <span className="font-medium" style={{ color: isHoliday ? '#f87171' : 'var(--text-primary)' }}>
                        {day.getDate()}
                      </span>
                      {cal?.keterangan && cal.jenis_hari !== 'kerja' && (
                        <span className="text-[9px] truncate max-w-[90%] mt-0.5 leading-tight" style={{ color: 'var(--text-muted)' }}>
                          {cal.keterangan}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-6 pt-4 border-t border-gray-100">
                {Object.entries(jenisLabel).map(([k, v]) => (
                  <span key={k} className="flex items-center gap-2 text-xs text-gray-500">
                    <div className={`w-3 h-3 rounded-full ${jenisLegendColor[k]}`} />
                    {v}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">Klik tanggal untuk mengubah jenis hari</p>
            </>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editModal && editData && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Edit Hari</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {format(new Date(editData.tanggal + 'T00:00'), 'EEEE, d MMMM yyyy', { locale: localeId })}
                </p>
              </div>
              <button onClick={() => setEditModal(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleEditSave} className="p-6 space-y-5">
              {/* Current status badge */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Status saat ini:</span>
                <span className={`badge ${jenisBadge[editData.jenis_hari]}`}>
                  {jenisLabel[editData.jenis_hari]}
                </span>
              </div>

              {/* Jenis Hari */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Tag size={14} /> Jenis Hari
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(jenisLabel).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, jenis_hari: k })}
                      className={`px-3 py-2.5 rounded-lg text-sm font-medium border-2 transition-all duration-150
                        ${editForm.jenis_hari === k
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Keterangan - only shown for non-kerja */}
              {editForm.jenis_hari !== 'kerja' && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <FileText size={14} /> Keterangan
                  </label>
                  <input
                    type="text"
                    value={editForm.keterangan}
                    onChange={e => setEditForm({ ...editForm, keterangan: e.target.value })}
                    placeholder={`cth: ${jenisLabel[editForm.jenis_hari]}`}
                    className="input-field"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">Kosongkan untuk menggunakan label default</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setEditModal(false)} className="btn-secondary">
                  Batal
                </button>
                <button type="submit" disabled={editSaving} className="btn-primary">
                  {editSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
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
