import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Lock, Unlock, Clock, ShieldCheck, CheckCircle2, XCircle, AlertTriangle, FileText, Send, Calendar } from 'lucide-react'

import { useToast } from '../contexts/ToastContext'

const namaBulan = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export default function TutupAbsen() {
  const { profile } = useAuth()
  const { toastSuccess, toastError, toastWarning } = useToast()
  const role = profile?.role
  const isManagement = role === 'manajemen' || role === 'admin'

  const now = new Date()
  const [tahun, setTahun] = useState(now.getFullYear())
  const [tab, setTab] = useState('status') // 'status' | 'requests'
  const [lockList, setLockList] = useState([])
  const [loading, setLoading] = useState(true)

  // Confirm Lock Modal State
  const [confirmLockModal, setConfirmLockModal] = useState(null) // { bulan, namaBulan, tahun }
  const [lockSubmitting, setLockSubmitting] = useState(false)

  // Request Modal State
  const [requestModal, setRequestModal] = useState(null) // { tahun, bulan, namaBulan }
  const [requestAlasan, setRequestAlasan] = useState('')
  const [requestSubmitting, setRequestSubmitting] = useState(false)

  // Approval Modal State
  const [approvalModal, setApprovalModal] = useState(null) // { record, action: 'APPROVE'|'REJECT' }
  const [approvalCatatan, setApprovalCatatan] = useState('')
  const [approvalSubmitting, setApprovalSubmitting] = useState(false)

  useEffect(() => { loadData() }, [tahun])

  async function loadData() {
    setLoading(true)
    const { data } = await supabase
      .from('absen_tutup_bulan')
      .select('*, request_user:absen_karyawan!request_by(nama), approved_user:absen_karyawan!approved_by(nama)')
      .eq('tahun', tahun)
      .order('bulan', { ascending: true })

    setLockList(data || [])
    setLoading(false)
  }

  function openConfirmLockModal(bln, namaBln) {
    setConfirmLockModal({ bulan: bln, namaBulan: namaBln, tahun })
  }

  async function doConfirmLockBulan() {
    if (!confirmLockModal) return
    setLockSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('absen_lock_bulan', {
        p_tahun: confirmLockModal.tahun,
        p_bulan: confirmLockModal.bulan,
        p_user_id: profile?.id || null
      })
      if (error) throw error
      toastSuccess('Berhasil Tutup Absen', `Absensi bulan ${confirmLockModal.namaBulan} ${confirmLockModal.tahun} berhasil ditutup.`)
      setConfirmLockModal(null)
      loadData()
    } catch (err) {
      toastError('Gagal Menutup Absen', err.message || 'Terjadi kesalahan sistem saat menutup absen.')
    } finally {
      setLockSubmitting(false)
    }
  }

  // Handle Submit Request Buka Lock
  async function handleSubmitRequest(e) {
    e.preventDefault()
    if (!requestAlasan.trim() || requestAlasan.trim().length < 5) {
      toastWarning('Alasan Diperlukan', 'Alasan pembukaan lock wajib diisi minimal 5 karakter.')
      return
    }
    setRequestSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('absen_request_buka_tutup_bulan', {
        p_tahun: requestModal.tahun,
        p_bulan: requestModal.bulan,
        p_alasan: requestAlasan,
        p_user_id: profile?.id || null
      })
      if (error) throw error
      toastSuccess('Permintaan Terkirim', 'Pengajuan buka lock berhasil dikirim ke Manajemen.')
      setRequestModal(null)
      setRequestAlasan('')
      loadData()
    } catch (err) {
      toastError('Gagal Mengirim Permintaan', err.message || 'Terjadi kesalahan saat mengumpulkan pengajuan.')
    } finally {
      setRequestSubmitting(false)
    }
  }

  // Handle Save Approval by Management
  async function handleSaveApproval() {
    if (!approvalModal) return
    setApprovalSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('absen_approve_buka_tutup_bulan', {
        p_tahun: approvalModal.tahun,
        p_bulan: approvalModal.bulan,
        p_action: approvalModal.action,
        p_catatan: approvalCatatan || null,
        p_user_id: profile?.id || null
      })
      if (error) throw error
      const actionText = approvalModal.action === 'APPROVE' ? 'disetujui. Akses edit terbuka 2 hari.' : 'ditolak.'
      toastSuccess('Status Approval Diperbarui', `Permintaan buka lock bulan ${namaBulan[approvalModal.bulan]} ${approvalModal.tahun} berhasil ${actionText}`)
      setApprovalModal(null)
      setApprovalCatatan('')
      loadData()
    } catch (err) {
      toastError('Gagal Memproses Approval', err.message || 'Terjadi kesalahan saat memproses keputusan.')
    } finally {
      setApprovalSubmitting(false)
    }
  }

  // Map month status data (1 to 12)
  const monthStatusList = useMemo(() => {
    const map = {}
    lockList.forEach(item => { map[item.bulan] = item })
    return Array.from({ length: 12 }, (_, i) => {
      const bln = i + 1
      const rec = map[bln]
      let lockState = 'OPEN' // 'OPEN', 'CLOSED', 'REQUESTED', 'UNLOCKED_TEMPORARY'
      let isExpired = false
      let sisaTimeStr = ''

      if (rec) {
        if (rec.status === 'UNLOCKED_TEMPORARY') {
          if (rec.unlocked_until && new Date() <= new Date(rec.unlocked_until)) {
            lockState = 'UNLOCKED_TEMPORARY'
            const diffMs = new Date(rec.unlocked_until) - new Date()
            const hours = Math.floor(diffMs / (1000 * 60 * 60))
            const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
            sisaTimeStr = `${hours} jam ${mins} menit`
          } else {
            lockState = 'CLOSED' // Expired
            isExpired = true
          }
        } else {
          lockState = rec.status
        }
      }

      return {
        bulan: bln,
        nama: namaBulan[bln],
        record: rec,
        lockState,
        isExpired,
        sisaTimeStr
      }
    })
  }, [lockList])

  const pendingRequests = useMemo(() => {
    return lockList.filter(item => item.status === 'REQUESTED')
  }, [lockList])

  return (
    <div>
      {/* Header Page */}
      <div className="page-header">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Lock className="text-cyan-400" size={24} />
              <span>Tutup Absen Bulanan & Approval Lock</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Kelola penguncian absen bulanan dan sistem approval pembukaan lock 2 hari oleh Manajemen.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={tahun}
              onChange={e => setTahun(+e.target.value)}
              className="select-field text-sm py-1.5"
            >
              {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tab Navigation Segmented Bar */}
        <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-3">
          <div className="bg-slate-950/90 p-1.5 rounded-2xl border border-slate-800 shadow-inner inline-flex items-center gap-1.5 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setTab('status')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 ${
                tab === 'status'
                  ? 'bg-cyan-500/20 !text-white border border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.35)]'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/60 font-medium'
              }`}
            >
              <Calendar size={15} className={tab === 'status' ? 'text-cyan-400' : 'text-slate-400'} />
              <span className="!text-white font-extrabold tracking-wide">Status Bulanan ({tahun})</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('requests')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 relative ${
                tab === 'requests'
                  ? 'bg-cyan-500/20 !text-white border border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.35)]'
                  : 'text-slate-300 hover:text-white hover:bg-slate-900/60 font-medium'
              }`}
            >
              <ShieldCheck size={15} className={tab === 'requests' ? 'text-cyan-400' : 'text-slate-400'} />
              <span className="!text-white font-extrabold tracking-wide">Permintaan Approval</span>
              {pendingRequests.length > 0 && (
                <span className="ml-1 px-2 py-0.5 rounded-full bg-rose-500 text-white font-extrabold text-[10px] shadow-md shadow-rose-950/80 animate-pulse">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          </div>

          <div className="text-xs text-slate-400 font-medium hidden sm:flex items-center gap-1.5">
            <Clock size={13} className="text-cyan-400" />
            <span>Sistem Penguncian Absen & Window Access 48 Jam</span>
          </div>
        </div>
      </div>

      <div className="main-content">
        {/* Tab 1: Status Lock Bulanan */}
        {tab === 'status' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {monthStatusList.map(m => (
                <div
                  key={m.bulan}
                  className={`card p-4 flex flex-col justify-between border transition-all ${
                    m.lockState === 'CLOSED'
                      ? 'border-rose-500/30 bg-rose-950/20'
                      : m.lockState === 'UNLOCKED_TEMPORARY'
                      ? 'border-emerald-500/40 bg-emerald-950/20'
                      : m.lockState === 'REQUESTED'
                      ? 'border-amber-500/40 bg-amber-950/20'
                      : 'border-slate-800 bg-slate-900/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-bold text-white text-base">{m.nama} {tahun}</span>

                      {/* Status Badges */}
                      {m.lockState === 'CLOSED' && (
                        <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-extrabold flex items-center gap-1">
                          <Lock size={12} /> DITUTUP
                        </span>
                      )}
                      {m.lockState === 'UNLOCKED_TEMPORARY' && (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold flex items-center gap-1 animate-pulse">
                          <Unlock size={12} /> Buka 2 Hari
                        </span>
                      )}
                      {m.lockState === 'REQUESTED' && (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-extrabold flex items-center gap-1">
                          <Clock size={12} /> Pending Approval
                        </span>
                      )}
                      {m.lockState === 'OPEN' && (
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-bold">
                          Belum Ditutup
                        </span>
                      )}
                    </div>

                    {/* Status Info Details */}
                    <div className="text-xs text-slate-400 space-y-1 mb-4 font-sans">
                      {m.lockState === 'UNLOCKED_TEMPORARY' && (
                        <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 text-[11px]">
                          <div className="font-bold">Akses Edit Terbuka Sementara</div>
                          <div className="text-[10px] text-emerald-300 mt-0.5">
                            Sisa waktu: <strong className="font-mono">{m.sisaTimeStr}</strong>
                          </div>
                        </div>
                      )}

                      {m.lockState === 'CLOSED' && (
                        <p className="text-slate-400">
                          Data absensi bulan ini <strong className="text-rose-300">terkunci rapat</strong>. Tidak dapat menambah atau mengedit absen.
                        </p>
                      )}

                      {m.lockState === 'REQUESTED' && m.record && (
                        <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-500/20 text-[11px] text-amber-200">
                          <div><span className="text-slate-400">Pemohon:</span> {m.record.request_user?.nama || 'Admin'}</div>
                          <div className="truncate"><span className="text-slate-400">Alasan:</span> {m.record.alasan_request}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    {m.lockState === 'OPEN' && (
                      <button
                        onClick={() => openConfirmLockModal(m.bulan, m.nama)}
                        className="w-full py-1.5 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Lock size={13} /> Tutup Absen
                      </button>
                    )}

                    {m.lockState === 'CLOSED' && (
                      <button
                        onClick={() => setRequestModal({ tahun, bulan: m.bulan, namaBulan: m.nama })}
                        className="w-full py-1.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Unlock size={13} /> Ajukan Buka Lock
                      </button>
                    )}

                    {m.lockState === 'UNLOCKED_TEMPORARY' && (
                      <button
                        onClick={() => openConfirmLockModal(m.bulan, m.nama)}
                        className="w-full py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Lock size={13} /> Kunci Kembali Sekarang
                      </button>
                    )}

                    {m.lockState === 'REQUESTED' && (
                      <span className="text-[11px] text-amber-400 italic font-medium">
                        Menunggu persetujuan Manajemen...
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Permintaan Approval (Khusus Manajemen & Admin) */}
        {tab === 'requests' && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-cyan-400" />
                <h3 className="font-bold text-white text-sm">Daftar Permintaan Buka Lock Tutup Absen</h3>
              </div>
              <span className="text-xs text-slate-400 font-medium">
                Persetujuan membuka lock sementara selama 2 Hari (48 Jam) oleh Manajemen
              </span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              </div>
            ) : pendingRequests.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <CheckCircle2 size={32} className="mx-auto text-slate-600 mb-2" />
                <span>Tidak ada permintaan buka lock yang menunggu approval untuk tahun {tahun}.</span>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="table-header">
                    <tr>
                      <th className="text-left px-4 py-3">Bulan & Tahun</th>
                      <th className="text-left px-4 py-3">Pemohon</th>
                      <th className="text-left px-4 py-3">Alasan Permintaan</th>
                      <th className="text-center px-4 py-3">Waktu Pengajuan</th>
                      <th className="text-center px-4 py-3">Aksi Approval</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {pendingRequests.map(r => (
                      <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-bold text-white">
                          {namaBulan[r.bulan]} {r.tahun}
                        </td>
                        <td className="px-4 py-3 text-slate-300 font-medium">
                          {r.request_user?.nama || 'Admin / Staff'}
                        </td>
                        <td className="px-4 py-3 text-slate-300 max-w-xs text-xs font-sans">
                          {r.alasan_request}
                        </td>
                        <td className="px-4 py-3 text-center text-slate-400 text-xs font-mono">
                          {r.request_at ? new Date(r.request_at).toLocaleString('id-ID') : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isManagement ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => setApprovalModal({ ...r, action: 'APPROVE' })}
                                className="btn-success py-1 px-3 text-xs flex items-center gap-1"
                              >
                                <CheckCircle2 size={13} /> Approve (2 Hari)
                              </button>
                              <button
                                onClick={() => setApprovalModal({ ...r, action: 'REJECT' })}
                                className="btn-danger py-1 px-3 text-xs flex items-center gap-1"
                              >
                                <XCircle size={13} /> Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500 italic">Khusus Role Management</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal 0: Custom Futuristic Lock Confirmation Modal */}
      {confirmLockModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl shadow-rose-950/50 relative overflow-hidden">
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-rose-500/20 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-start gap-3.5 relative">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0 shadow-inner">
                <Lock size={24} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Konfirmasi Tutup Absen Bulanan</h3>
                <p className="text-xs text-rose-300/90 mt-0.5 font-medium">
                  Bulan {confirmLockModal.namaBulan} {confirmLockModal.tahun}
                </p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs text-slate-300 font-sans relative">
              <p className="flex items-start gap-2">
                <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Apakah Anda yakin ingin <strong className="text-rose-300">MENUTUP absensi</strong> bulan <strong>{confirmLockModal.namaBulan} {confirmLockModal.tahun}</strong>?
                </span>
              </p>
              <p className="text-[11px] text-slate-400 pl-5">
                Seluruh pengabsenan dan pengeditan data pada bulan ini akan <strong>terkunci rapat</strong> dan hanya dapat dibuka kembali melalui persetujuan Manajemen.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmLockModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={doConfirmLockBulan}
                disabled={lockSubmitting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-lg shadow-rose-950/60"
              >
                {lockSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Lock size={14} />
                )}
                <span>Ya, Tutup Absen Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: Request Buka Lock */}
      {requestModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <form onSubmit={handleSubmitRequest} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Unlock className="text-amber-400" size={20} />
                <h3 className="font-bold text-white text-base">Permintaan Buka Lock Tutup Absen</h3>
              </div>
              <button type="button" onClick={() => setRequestModal(null)} className="p-1 text-slate-400 hover:text-white">
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-sans">
                <div>Bulan: <strong className="text-white">{requestModal.namaBulan} {requestModal.tahun}</strong></div>
                <div className="text-slate-400 text-[11px] mt-1">
                  Persetujuan oleh <strong>Management</strong> akan membuka akses pengeditan absen selama <strong>2 Hari (48 Jam)</strong>. Setelah itu absen akan terkunci kembali.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  Alasan Pembukaan Lock (Wajib)
                </label>
                <textarea
                  value={requestAlasan}
                  onChange={e => setRequestAlasan(e.target.value)}
                  placeholder="Contoh: Koreksi jam lembur karyawan X karena ada penyesuaian SPK..."
                  className="w-full h-24 p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500 font-sans"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setRequestModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={requestSubmitting || !requestAlasan.trim()}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-amber-950/50"
              >
                {requestSubmitting ? (
                  <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                <span>Kirim Permintaan</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal 2: Management Approval Action */}
      {approvalModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-cyan-400" size={20} />
                <h3 className="font-bold text-white text-base">
                  {approvalModal.action === 'APPROVE' ? 'Setujui Buka Lock (2 Hari)' : 'Tolak Permintaan Buka Lock'}
                </h3>
              </div>
              <button type="button" onClick={() => setApprovalModal(null)} className="p-1 text-slate-400 hover:text-white">
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 font-sans">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                <div>Bulan & Tahun: <strong className="text-white">{namaBulan[approvalModal.bulan]} {approvalModal.tahun}</strong></div>
                <div>Pemohon: <strong className="text-cyan-300">{approvalModal.request_user?.nama || 'Admin'}</strong></div>
                <div>Alasan: <em className="text-slate-300">{approvalModal.alasan_request}</em></div>
              </div>

              {approvalModal.action === 'APPROVE' && (
                <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-emerald-200 text-[11px]">
                  Persetujuan ini akan membuka akses edit absen untuk bulan <strong>{namaBulan[approvalModal.bulan]} {approvalModal.tahun}</strong> selama <strong>2 HARI (48 JAM)</strong>. Setelah 48 jam, status akan otomatis terkunci kembali.
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-200 mb-1">
                  Catatan Management (Opsional)
                </label>
                <input
                  value={approvalCatatan}
                  onChange={e => setApprovalCatatan(e.target.value)}
                  placeholder="Catatan persetujuan / alasan penolakan..."
                  className="input-field text-xs py-2 bg-slate-950 border-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setApprovalModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveApproval}
                disabled={approvalSubmitting}
                className={`px-5 py-2 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-lg ${
                  approvalModal.action === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {approvalSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                <span>{approvalModal.action === 'APPROVE' ? 'Setujui & Buka 2 Hari' : 'Tolak Permintaan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
