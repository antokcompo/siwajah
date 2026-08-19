import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle, X, Clock } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function ImportAbsensi() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])

  useEffect(() => { loadHistory() }, [])

  async function loadHistory() {
    const { data } = await supabase.from('absen_import_log').select('*').order('created_at', { ascending: false }).limit(10)
    setHistory(data || [])
  }

  function handleFile(e) {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    setResult(null)
    setError('')

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

        const scans = []
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i]
          if (!row || row.length < 2) continue
          const uid = String(row[0] ?? '').trim()
          const ts = row[1]
          if (!uid || !ts) continue

          let timestamp
          const pad2 = (n) => String(n).padStart(2, '0')
          if (ts instanceof Date) {
            timestamp = `${ts.getUTCFullYear()}-${pad2(ts.getUTCMonth() + 1)}-${pad2(ts.getUTCDate())}T${pad2(ts.getUTCHours())}:${pad2(ts.getUTCMinutes())}:${pad2(ts.getUTCSeconds())}`
          } else if (typeof ts === 'number') {
            const d = XLSX.SSF.parse_date_code(ts)
            timestamp = `${d.y}-${pad2(d.m)}-${pad2(d.d)}T${pad2(d.H || 0)}:${pad2(d.M || 0)}:${pad2(d.S || 0)}`
          } else {
            timestamp = String(ts).replace(/Z$/i, '')
          }

          if (!timestamp || timestamp.includes('Invalid')) continue
          scans.push({ uid, timestamp })
        }

        if (scans.length === 0) {
          setError('Tidak ada data valid ditemukan di file')
          setPreview(null)
          return
        }

        const dates = scans.map(s => s.timestamp.slice(0, 10))
        const uids = [...new Set(scans.map(s => s.uid))]
        const minDate = dates.reduce((a, b) => a < b ? a : b)
        const maxDate = dates.reduce((a, b) => a > b ? a : b)

        setPreview({
          scans,
          total: scans.length,
          minDate,
          maxDate,
          dateRange: `${minDate} s/d ${maxDate}`,
          uniqueUids: uids.length,
          uids,
        })
      } catch (err) {
        setError('Gagal membaca file: ' + err.message)
        setPreview(null)
      }
    }
    reader.readAsArrayBuffer(f)
  }

  async function handleImport() {
    if (!preview) return
    setImporting(true)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('absen_import_dan_proses', {
        p_scans: preview.scans,
        p_nama_file: file.name,
      })
      if (rpcError) throw rpcError
      setResult(data)
      setPreview(null)
      setFile(null)
      loadHistory()
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  function cancelPreview() {
    setPreview(null)
    setFile(null)
    setError('')
  }

  const fmtDate = d => {
    if (!d) return '-'
    return new Date(d + 'T00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const fmtTime = ts => {
    if (!ts) return '-'
    const t = ts.split('T')[1]
    return t ? t.slice(0, 5) : '-'
  }

  const previewRows = useMemo(() => {
    if (!preview) return []
    return preview.scans.slice(0, 50)
  }, [preview])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Absensi</h1>
          <p className="text-gray-500 text-xs mt-0.5">Upload data dari mesin absen</p>
        </div>
      </div>

      <div className="main-content">
      {/* Upload area */}
      <div className="card p-6 mb-6">
        <div className="bg-blue-500/10 border border-blue-400/30 rounded-xl p-4 text-sm text-blue-300 mb-5">
          <p className="font-medium mb-1 text-blue-200">Format file yang didukung:</p>
          <p>File ekspor mesin absen (.xlsx) — Kolom A: UID, Kolom B: Timestamp</p>
          <p className="text-xs mt-1 text-blue-400/80">Sheet pertama akan dibaca otomatis</p>
        </div>

        <label className="block cursor-pointer">
          <div className="border-2 border-dashed border-slate-600 rounded-xl p-10 text-center hover:border-blue-400 hover:bg-blue-500/10 transition-all duration-200">
            <Upload size={36} className="mx-auto text-slate-400 mb-3" />
            <p className="text-slate-200 font-medium">{file ? file.name : 'Pilih file Excel (.xlsx)'}</p>
            <p className="text-slate-400 text-sm mt-1">Klik atau drag file ke sini</p>
          </div>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        </label>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-400/30 text-red-400 rounded-xl p-4 mb-6 flex items-start gap-2.5 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Preview */}
      {preview && (
        <div className="card mb-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <span className="font-semibold text-slate-200 flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <FileSpreadsheet size={16} className="text-blue-400" />
              </div>
              Preview Data — {file?.name}
            </span>
            <button onClick={cancelPreview} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
              <X size={18} className="text-slate-400" />
            </button>
          </div>

          {/* Stats */}
          <div className="px-5 pt-4 pb-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-2xl font-bold text-slate-100 tabular-nums">{new Intl.NumberFormat('id-ID').format(preview.total)}</div>
                <div className="text-xs text-slate-400 mt-1">Total baris scan</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-2xl font-bold text-slate-100 tabular-nums">{preview.uniqueUids}</div>
                <div className="text-xs text-slate-400 mt-1">UID unik</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-sm font-semibold text-slate-100">{fmtDate(preview.minDate)}</div>
                <div className="text-xs text-slate-400 mt-1">Tanggal awal</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="text-sm font-semibold text-slate-100">{fmtDate(preview.maxDate)}</div>
                <div className="text-xs text-slate-400 mt-1">Tanggal akhir</div>
              </div>
            </div>
          </div>

          {/* Scan preview table */}
          <div className="px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-300">Data Scan</span>
              {preview.total > 50 && (
                <span className="text-xs text-slate-500">Menampilkan 50 dari {new Intl.NumberFormat('id-ID').format(preview.total)} baris</span>
              )}
            </div>
            <div className="table-scroll rounded-xl max-h-60 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="table-header sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2.5 w-12">#</th>
                    <th className="text-left px-4 py-2.5">UID Mesin</th>
                    <th className="text-left px-4 py-2.5">Tanggal</th>
                    <th className="text-left px-4 py-2.5">Jam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {previewRows.map((scan, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-slate-500 text-xs">{i + 1}</td>
                      <td className="px-4 py-2 font-mono text-cyan-400 text-xs">{scan.uid}</td>
                      <td className="px-4 py-2 text-slate-300">{fmtDate(scan.timestamp.slice(0, 10))}</td>
                      <td className="px-4 py-2 text-slate-200 font-mono">{fmtTime(scan.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 pb-5 pt-2 flex gap-3">
            <button onClick={handleImport} disabled={importing} className="btn-success">
              {importing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Mengimpor...
                </>
              ) : `Import ${new Intl.NumberFormat('id-ID').format(preview.total)} Scan`}
            </button>
            <button onClick={cancelPreview} className="btn-secondary">Batal</button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2.5 text-emerald-400 font-semibold mb-3">
            <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <CheckCircle size={18} />
            </div>
            Import berhasil!
          </div>
          <div className="text-sm text-emerald-300 space-y-1.5 ml-10">
            <p>Jumlah baris: {new Intl.NumberFormat('id-ID').format(result.jumlah_baris)}</p>
            <p>Rentang: {fmtDate(result.tanggal_mulai)} s/d {fmtDate(result.tanggal_akhir)}</p>
            {result.uid_tidak_dikenal?.length > 0 && (
              <p className="text-amber-400">UID tidak dikenal: {result.uid_tidak_dikenal.join(', ')}</p>
            )}
            {result.anomali_dates?.length > 0 && (
              <p className="text-red-400">Anomali massal terdeteksi: {result.anomali_dates.join(', ')}</p>
            )}
          </div>
        </div>
      )}

      {/* History */}
      <div className="card">
        <div className="px-5 py-4 border-b border-white/5 font-semibold text-slate-200 flex items-center gap-2">
          <Clock size={16} className="text-slate-400" />
          Riwayat Import
        </div>
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="table-header">
              <tr>
                <th className="text-left px-5 py-3">File</th>
                <th className="text-left px-4 py-3">Tanggal Import</th>
                <th className="text-right px-4 py-3">Baris</th>
                <th className="text-left px-4 py-3">Rentang</th>
                <th className="text-center px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {history.map(h => (
                <tr key={h.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3 flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                      <FileSpreadsheet size={16} className="text-emerald-400" />
                    </div>
                    <span className="font-medium text-slate-200">{h.nama_file}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{new Date(h.created_at).toLocaleString('id-ID')}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-200 tabular-nums">{new Intl.NumberFormat('id-ID').format(h.jumlah_baris)}</td>
                  <td className="px-4 py-3 text-slate-400">{fmtDate(h.tanggal_mulai)} — {fmtDate(h.tanggal_akhir)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`badge ${h.status === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {h.status}
                    </span>
                  </td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">Belum ada riwayat import</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  )
}
