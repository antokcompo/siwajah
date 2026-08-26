import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Search, UserPlus, Pencil, Trash2, X, Users, Shield, CheckCircle, AlertTriangle, Eye, EyeOff, KeyRound, Plus, Building2, Check } from 'lucide-react'

const roleOptions = [
  { value: 'admin', label: 'Admin', desc: 'Akses penuh ke semua fitur' },
  { value: 'atasan', label: 'Supervisor', desc: 'Koreksi & approval lembur' },
  { value: 'hrd', label: 'HRD', desc: 'Master karyawan & rekap gaji' },
  { value: 'manajemen', label: 'Manajemen', desc: 'Lihat laporan & dashboard' },
]

const roleBadge = {
  admin: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  atasan: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  hrd: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  manajemen: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
}

const roleLabel = { admin: 'Admin', atasan: 'Supervisor', hrd: 'HRD', manajemen: 'Manajemen' }

function checkPassword(pw) {
  return [
    { ok: pw.length >= 8, label: 'Minimal 8 karakter' },
    { ok: /[A-Z]/.test(pw), label: 'Huruf besar (A-Z)' },
    { ok: /[a-z]/.test(pw), label: 'Huruf kecil (a-z)' },
    { ok: /[0-9]/.test(pw), label: 'Angka (0-9)' },
    { ok: /[^A-Za-z0-9]/.test(pw), label: 'Simbol (!@#$...)' },
  ]
}

function PasswordInput({ value, onChange, placeholder, id }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required
        className="input-field pr-11"
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all duration-200"
        style={{ color: show ? '#67e8f9' : '#475569' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        tabIndex={-1}
      >
        {show ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
      </button>
    </div>
  )
}

function PasswordRules({ password }) {
  if (!password) return null
  const rules = checkPassword(password)
  const allOk = rules.every(r => r.ok)
  return (
    <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1">
      {rules.map(r => (
        <div key={r.label} className="flex items-center gap-1.5 text-xs transition-all duration-200" style={{ color: r.ok ? '#34d399' : '#64748b' }}>
          <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-all duration-200"
            style={r.ok ? { background: 'rgba(52, 211, 153, 0.2)', border: '1px solid rgba(52, 211, 153, 0.4)' } : { background: 'rgba(100, 116, 139, 0.15)', border: '1px solid rgba(100, 116, 139, 0.2)' }}>
            {r.ok && <CheckCircle size={8} />}
          </div>
          {r.label}
        </div>
      ))}
    </div>
  )
}

export default function ManajemenUser() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ user_id: '', nama: '', role: 'atasan', kode_proyek: '524006', proyek_akses: ['524006'] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', password: '', confirmPassword: '', nama: '', role: 'atasan', kode_proyek: '524006', proyek_akses: ['524006'] })
  const [creating, setCreating] = useState(false)

  const [showResetModal, setShowResetModal] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetForm, setResetForm] = useState({ password: '', confirmPassword: '' })
  const [resetting, setResetting] = useState(false)

  const [proyekList, setProyekList] = useState([])
  const [showQuickAddProyek, setShowQuickAddProyek] = useState(false)
  const [quickProyekForm, setQuickProyekForm] = useState({ kode_proyek: '', nama_proyek: '', nama_singkat: '', lokasi: '', zona_waktu: 'Asia/Jayapura' })
  const [savingQuickProyek, setSavingQuickProyek] = useState(false)
  const [quickProyekError, setQuickProyekError] = useState('')

  useEffect(() => {
    load()
    fetchProyekList()
  }, [])

  async function fetchProyekList() {
    try {
      const { data: dbData } = await supabase.from('absen_proyek').select('*').order('created_at', { ascending: true })
      if (dbData && dbData.length > 0) {
        setProyekList(dbData)
      } else {
        setProyekList([
          { kode_proyek: '524006', nama_proyek: 'Proyek Portsite Accommodation Complex (524006)', nama_singkat: 'Portsite Accommodation Complex' }
        ])
      }
    } catch {
      setProyekList([
        { kode_proyek: '524006', nama_proyek: 'Proyek Portsite Accommodation Complex (524006)', nama_singkat: 'Portsite Accommodation Complex' }
      ])
    }
  }

  async function load() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase.rpc('absen_list_auth_users')
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    const parsed = typeof data === 'string' ? JSON.parse(data) : data
    setUsers(parsed || [])
    setLoading(false)
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q || (u.email || '').toLowerCase().includes(q) || (u.nama || '').toLowerCase().includes(q)
    const matchFilter = filter === 'all' || (filter === 'active' && u.has_profile) || (filter === 'inactive' && !u.has_profile)
    return matchSearch && matchFilter
  })

  const activeCount = users.filter(u => u.has_profile).length
  const inactiveCount = users.filter(u => !u.has_profile).length

  function openAdd(authUser) {
    setEditing(null)
    setForm({
      user_id: authUser?.id || '',
      nama: authUser?.email?.split('@')[0] || '',
      role: 'atasan',
      kode_proyek: '524006',
      proyek_akses: ['524006']
    })
    setShowModal(true)
  }

  function openEdit(u) {
    setEditing(u)
    setForm({
      user_id: u.id,
      nama: u.nama,
      role: u.role,
      kode_proyek: u.kode_proyek || '524006',
      proyek_akses: u.proyek_akses && u.proyek_akses.length > 0 ? u.proyek_akses : [u.kode_proyek || '524006']
    })
    setShowModal(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { error: err } = await supabase.rpc('absen_upsert_user_profile', {
      p_user_id: form.user_id,
      p_nama: form.nama,
      p_role: form.role,
      p_kode_proyek: form.kode_proyek,
      p_proyek_akses: form.proyek_akses
    })

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setShowModal(false)
    setSuccess(editing ? 'User berhasil diperbarui' : 'User berhasil ditambahkan ke SI Wajah')
    setTimeout(() => setSuccess(''), 3000)
    load()
  }

  async function handleDelete() {
    if (!confirmDelete) return
    setError('')

    const apiUrl = import.meta.env.VITE_API_URL || ''
    if (apiUrl) {
      try {
        const res = await fetch(`${apiUrl}/api/admin/delete-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: confirmDelete.id })
        })
        if (res.ok) {
          setConfirmDelete(null)
          setSuccess(`User ${confirmDelete.email} berhasil dihapus dari sistem`)
          setTimeout(() => setSuccess(''), 4000)
          load()
          return
        }
      } catch (_err) {
        // Fallback
      }
    }

    const { data, error: err } = await supabase.rpc('absen_delete_auth_user', {
      p_user_id: confirmDelete.id,
    })

    if (err || data?.error) {
      const res = await supabase.rpc('absen_delete_user_profile', { p_user_id: confirmDelete.id })
      if (res.error) {
        setError(res.error.message)
        setConfirmDelete(null)
        return
      }
    }

    setConfirmDelete(null)
    setSuccess(`User ${confirmDelete.email} berhasil dihapus dari sistem`)
    setTimeout(() => setSuccess(''), 4000)
    load()
  }

  function openCreateUser() {
    setCreateForm({
      email: '',
      password: '',
      confirmPassword: '',
      nama: '',
      role: 'atasan',
      kode_proyek: '524006',
      proyek_akses: ['524006']
    })
    setShowCreateModal(true)
  }

  async function handleCreateUser(e) {
    e.preventDefault()
    setError('')

    const rules = checkPassword(createForm.password)
    if (!rules.every(r => r.ok)) {
      setError('Password belum memenuhi semua persyaratan')
      return
    }
    if (createForm.password !== createForm.confirmPassword) {
      setError('Konfirmasi password tidak cocok')
      return
    }

    setCreating(true)
    const cleanEmail = createForm.email.trim().toLowerCase()

    const apiUrl = import.meta.env.VITE_API_URL || ''
    if (apiUrl) {
      try {
        const res = await fetch(`${apiUrl}/api/admin/create-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: cleanEmail,
            password: createForm.password,
            nama: createForm.nama,
            role: createForm.role,
            kode_proyek: createForm.kode_proyek,
            proyek_akses: createForm.proyek_akses,
          })
        })
        const resData = await res.json()
        if (res.ok && resData.success) {
          setCreating(false)
          setShowCreateModal(false)
          setSuccess(`User ${cleanEmail} berhasil dibuat! User dapat langsung login di SI Wajah.`)
          setTimeout(() => setSuccess(''), 4000)
          load()
          return
        } else if (resData?.error) {
          setError(resData.error)
          setCreating(false)
          return
        }
      } catch (_err) {
        // Fallback to RPC
      }
    }

    const { data, error: err } = await supabase.rpc('absen_create_auth_user', {
      p_email: cleanEmail,
      p_password: createForm.password,
      p_nama: createForm.nama,
      p_role: createForm.role,
      p_kode_proyek: createForm.kode_proyek,
      p_proyek_akses: createForm.proyek_akses,
    })

    if (err) {
      setError(err.message)
      setCreating(false)
      return
    }

    if (data?.error) {
      setError(data.error)
      setCreating(false)
      return
    }

    setCreating(false)
    setShowCreateModal(false)
    setSuccess(`User ${cleanEmail} berhasil dibuat! User dapat langsung login di SI Wajah.`)
    setTimeout(() => setSuccess(''), 4000)
    load()
  }

  async function handleSaveQuickProyek(e) {
    e.preventDefault()
    if (!quickProyekForm.kode_proyek.trim() || !quickProyekForm.nama_proyek.trim()) {
      setQuickProyekError('Kode Proyek & Nama Proyek wajib diisi.')
      return
    }

    setSavingQuickProyek(true)
    setQuickProyekError('')

    try {
      const payload = {
        p_kode_proyek: quickProyekForm.kode_proyek.trim(),
        p_nama_proyek: quickProyekForm.nama_proyek.trim(),
        p_nama_singkat: quickProyekForm.nama_singkat.trim() || quickProyekForm.nama_proyek.trim(),
        p_lokasi: quickProyekForm.lokasi.trim() || null,
        p_zona_waktu: quickProyekForm.zona_waktu
      }

      const { data: resData, error: rpcErr } = await supabase.rpc('absen_upsert_proyek', payload)
      if (rpcErr) throw rpcErr

      await fetchProyekList()

      const newKode = quickProyekForm.kode_proyek.trim()
      setForm(prev => ({
        ...prev,
        kode_proyek: newKode,
        proyek_akses: Array.from(new Set([...prev.proyek_akses, newKode]))
      }))
      setCreateForm(prev => ({
        ...prev,
        kode_proyek: newKode,
        proyek_akses: Array.from(new Set([...prev.proyek_akses, newKode]))
      }))

      setShowQuickAddProyek(false)
      setQuickProyekForm({ kode_proyek: '', nama_proyek: '', nama_singkat: '', lokasi: '', zona_waktu: 'Asia/Jayapura' })
    } catch (err) {
      setQuickProyekError(err.message)
    } finally {
      setSavingQuickProyek(false)
    }
  }

  function openResetPassword(u) {
    setResetTarget(u)
    setResetForm({ password: '', confirmPassword: '' })
    setShowResetModal(true)
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    setError('')

    const rules = checkPassword(resetForm.password)
    if (!rules.every(r => r.ok)) {
      setError('Password belum memenuhi semua persyaratan')
      return
    }
    if (resetForm.password !== resetForm.confirmPassword) {
      setError('Konfirmasi password tidak cocok')
      return
    }

    setResetting(true)

    const apiUrl = import.meta.env.VITE_API_URL || ''
    if (apiUrl) {
      try {
        const res = await fetch(`${apiUrl}/api/admin/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: resetTarget.id,
            password: resetForm.password,
          })
        })
        const resData = await res.json()
        if (res.ok && resData.success) {
          setResetting(false)
          setShowResetModal(false)
          setSuccess(`Password ${resetTarget.email} berhasil direset!`)
          setTimeout(() => setSuccess(''), 4000)
          return
        } else if (resData?.error) {
          setError(resData.error)
          setResetting(false)
          return
        }
      } catch (_err) {
        // Fallback to RPC
      }
    }

    const { data, error: err } = await supabase.rpc('absen_admin_reset_password', {
      p_user_id: resetTarget.id,
      p_new_password: resetForm.password,
    })

    if (err) {
      setError(err.message)
      setResetting(false)
      return
    }

    if (data?.error) {
      setError(data.error)
      setResetting(false)
      return
    }

    setResetting(false)
    setShowResetModal(false)
    setSuccess(`Password ${resetTarget.email} berhasil direset!`)
    setTimeout(() => setSuccess(''), 4000)
  }

  function fmtDate(d) {
    if (!d) return '-'
    return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Manajemen User</h1>
          <p className="text-gray-500 text-xs mt-0.5">Kelola akses pengguna sistem SI Wajah</p>
        </div>
        <button onClick={openCreateUser} className="btn-primary text-xs">
          <Plus size={14} /> User Baru
        </button>
      </div>

      <div className="main-content">
        {error && (
          <div className="mb-4 p-3.5 rounded-xl flex items-start gap-2.5 text-sm" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3.5 rounded-xl flex items-center gap-2.5 text-sm animate-fade-in" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
            <CheckCircle size={16} className="shrink-0" />
            {success}
          </div>
        )}

        {/* Stats pills */}
        <div className="flex gap-3 mb-4">
          {[
            { key: 'all', label: 'Semua', count: users.length },
            { key: 'active', label: 'Aktif SI Wajah', count: activeCount },
            { key: 'inactive', label: 'Belum Terdaftar', count: inactiveCount },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
              style={filter === f.key
                ? { background: 'rgba(6, 182, 212, 0.15)', border: '1px solid rgba(6, 182, 212, 0.3)', color: '#67e8f9' }
                : { background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#94a3b8' }
              }
            >
              {f.label} <span className="ml-1.5 font-bold">{f.count}</span>
            </button>
          ))}
        </div>

        <div className="card">
          <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#475569' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Cari email atau nama..."
                className="input-field pl-10"
              />
            </div>
            <span className="text-sm whitespace-nowrap font-medium" style={{ color: '#64748b' }}>{filtered.length} user</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(59, 130, 246, 0.2)', borderTopColor: '#3b82f6' }} />
            </div>
          ) : (
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="table-header">
                  <tr>
                    <th className="text-left px-5 py-3 w-8">#</th>
                    <th className="text-left px-4 py-3">Email</th>
                    <th className="text-left px-4 py-3">Nama</th>
                    <th className="text-center px-4 py-3">Role</th>
                    <th className="text-left px-4 py-3">Proyek Aktif (Assign Login)</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Terdaftar</th>
                    <th className="text-center px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  {filtered.map((row, idx) => {
                    const isSelf = row.id === user?.id
                    return (
                      <tr key={row.id} className="transition-colors hover:bg-white/[0.02]">
                        <td className="px-5 py-3" style={{ color: '#475569' }}>{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-white">{row.email}</td>
                        <td className="px-4 py-3" style={{ color: '#94a3b8' }}>{row.has_profile ? row.nama : '-'}</td>
                        <td className="px-4 py-3 text-center">
                          {row.has_profile ? (
                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold border ${roleBadge[row.role] || ''}`}>
                              {roleLabel[row.role] || row.role}
                            </span>
                          ) : (
                            <span style={{ color: '#475569' }}>-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.has_profile ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                              <Building2 size={12} className="text-cyan-400" />
                              {row.kode_proyek || '524006'}
                            </span>
                          ) : (
                            <span style={{ color: '#475569' }}>-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.has_profile ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Aktif
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: 'rgba(100, 116, 139, 0.15)', color: '#64748b', border: '1px solid rgba(100, 116, 139, 0.2)' }}>
                              Belum
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#64748b' }}>{fmtDate(row.auth_created_at)}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {row.has_profile ? (
                              <>
                                <button onClick={() => openEdit(row)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-blue-500/10" style={{ color: '#60a5fa' }}>
                                  <Pencil size={13} /> Edit
                                </button>
                                <button onClick={() => openResetPassword(row)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-amber-500/10" style={{ color: '#fbbf24' }} title="Reset Password">
                                  <KeyRound size={13} />
                                </button>
                                {!isSelf && (
                                  <button onClick={() => setConfirmDelete(row)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-red-500/10" style={{ color: '#f87171' }}>
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </>
                            ) : (
                              <button onClick={() => openAdd(row)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors hover:bg-emerald-500/10" style={{ color: '#34d399' }}>
                                <UserPlus size={13} /> Tambahkan
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="px-5 py-12 text-center" style={{ color: '#475569' }}>
                      <Users size={32} className="mx-auto mb-2" style={{ color: '#334155' }} />
                      Tidak ada user ditemukan
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal Tambah ke SI Wajah / Edit */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(6, 182, 212, 0.15)' }}>
                  {editing ? <Pencil size={16} style={{ color: '#67e8f9' }} /> : <UserPlus size={16} style={{ color: '#67e8f9' }} />}
                </div>
                <span className="font-semibold text-white">{editing ? 'Edit User' : 'Tambah User ke SI Wajah'}</span>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg transition-colors hover:bg-white/10" style={{ color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              {!editing && (
                <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', color: '#93c5fd' }}>
                  User dari database bersama (simontok / simonika) akan ditambahkan aksesnya ke SI Wajah.
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Email</label>
                <input value={users.find(u => u.id === form.user_id)?.email || ''} disabled className="input-field opacity-60" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Nama Tampilan *</label>
                <input value={form.nama} onChange={e => setForm({ ...form, nama: e.target.value })} required className="input-field" placeholder="Nama lengkap user" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium" style={{ color: '#94a3b8' }}>
                    Assign Proyek Aktif Login (Kode PK) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowQuickAddProyek(true)}
                    className="text-xs font-bold text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    <Plus size={12} /> Proyek Baru
                  </button>
                </div>
                <select
                  value={form.kode_proyek}
                  onChange={e => setForm({ ...form, kode_proyek: e.target.value })}
                  className="input-field font-mono font-bold bg-slate-900 text-white"
                  required
                >
                  {proyekList.map(p => (
                    <option key={p.kode_proyek} value={p.kode_proyek} className="bg-slate-900 text-white">
                      {p.kode_proyek} — {p.nama_singkat || p.nama_proyek}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Role *</label>
                <div className="space-y-2">
                  {roleOptions.map(r => (
                    <label key={r.value} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150"
                      style={form.role === r.value
                        ? { background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)' }
                        : { background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }
                      }>
                      <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={e => setForm({ ...form, role: e.target.value })} className="w-4 h-4 text-cyan-500 border-gray-600 focus:ring-cyan-500" />
                      <div>
                        <div className="text-sm font-medium text-white">{r.label}</div>
                        <div className="text-xs" style={{ color: '#64748b' }}>{r.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Batal</button>
                <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Buat User Baru */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(59, 130, 246, 0.2))' }}>
                  <Plus size={16} style={{ color: '#67e8f9' }} />
                </div>
                <span className="font-semibold text-white">Buat User Baru</span>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 rounded-lg transition-colors hover:bg-white/10" style={{ color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Email *</label>
                <input type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} required className="input-field" placeholder="user@email.com" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Nama Tampilan *</label>
                <input value={createForm.nama} onChange={e => setCreateForm({ ...createForm, nama: e.target.value })} required className="input-field" placeholder="Nama lengkap" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Password *</label>
                <PasswordInput value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} placeholder="Buat password" id="create-pw" />
                <PasswordRules password={createForm.password} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Konfirmasi Password *</label>
                <PasswordInput value={createForm.confirmPassword} onChange={e => setCreateForm({ ...createForm, confirmPassword: e.target.value })} placeholder="Ulangi password" id="create-cpw" />
                {createForm.confirmPassword && createForm.password !== createForm.confirmPassword && (
                  <p className="mt-1.5 text-xs flex items-center gap-1" style={{ color: '#f87171' }}>
                    <AlertTriangle size={11} /> Password tidak cocok
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium" style={{ color: '#94a3b8' }}>
                    Assign Proyek Aktif Login (Kode PK) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowQuickAddProyek(true)}
                    className="text-xs font-bold text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    <Plus size={12} /> Proyek Baru
                  </button>
                </div>
                <select
                  value={createForm.kode_proyek}
                  onChange={e => setCreateForm({ ...createForm, kode_proyek: e.target.value })}
                  className="input-field font-mono font-bold bg-slate-900 text-white"
                  required
                >
                  {proyekList.map(p => (
                    <option key={p.kode_proyek} value={p.kode_proyek} className="bg-slate-900 text-white">
                      {p.kode_proyek} — {p.nama_singkat || p.nama_proyek}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Role *</label>
                <div className="space-y-2">
                  {roleOptions.map(r => (
                    <label key={r.value} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150"
                      style={createForm.role === r.value
                        ? { background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)' }
                        : { background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }
                      }>
                      <input type="radio" name="create-role" value={r.value} checked={createForm.role === r.value} onChange={e => setCreateForm({ ...createForm, role: e.target.value })} className="w-4 h-4 text-cyan-500 border-gray-600 focus:ring-cyan-500" />
                      <div>
                        <div className="text-sm font-medium text-white">{r.label}</div>
                        <div className="text-xs" style={{ color: '#64748b' }}>{r.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-3">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn-secondary">Batal</button>
                <button type="submit" disabled={creating} className="btn-primary">{creating ? 'Membuat...' : 'Buat User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reset Password */}
      {showResetModal && resetTarget && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251, 191, 36, 0.15)' }}>
                  <KeyRound size={16} style={{ color: '#fbbf24' }} />
                </div>
                <span className="font-semibold text-white">Reset Password</span>
              </div>
              <button onClick={() => setShowResetModal(false)} className="p-1.5 rounded-lg transition-colors hover:bg-white/10" style={{ color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.2)', color: '#fcd34d' }}>
                Reset password untuk <strong className="text-white">{resetTarget.email}</strong>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Password Baru *</label>
                <PasswordInput value={resetForm.password} onChange={e => setResetForm({ ...resetForm, password: e.target.value })} placeholder="Password baru" id="reset-pw" />
                <PasswordRules password={resetForm.password} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Konfirmasi Password *</label>
                <PasswordInput value={resetForm.confirmPassword} onChange={e => setResetForm({ ...resetForm, confirmPassword: e.target.value })} placeholder="Ulangi password baru" id="reset-cpw" />
                {resetForm.confirmPassword && resetForm.password !== resetForm.confirmPassword && (
                  <p className="mt-1.5 text-xs flex items-center gap-1" style={{ color: '#f87171' }}>
                    <AlertTriangle size={11} /> Password tidak cocok
                  </p>
                )}
              </div>

              <div className="flex gap-3 justify-end pt-3">
                <button type="button" onClick={() => setShowResetModal(false)} className="btn-secondary">Batal</button>
                <button type="submit" disabled={resetting} className="btn-primary">{resetting ? 'Mereset...' : 'Reset Password'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Proyek Modal */}
      {showQuickAddProyek && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-sm font-black text-white flex items-center gap-2">
                <Building2 size={18} className="text-cyan-400" /> Tambah Kode Proyek Aktif Baru
              </h4>
              <button type="button" onClick={() => setShowQuickAddProyek(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {quickProyekError && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-xs text-rose-300 font-bold">
                {quickProyekError}
              </div>
            )}

            <form onSubmit={handleSaveQuickProyek} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Kode Proyek (Primary Key) *</label>
                <input
                  type="text"
                  value={quickProyekForm.kode_proyek}
                  onChange={e => setQuickProyekForm({ ...quickProyekForm, kode_proyek: e.target.value })}
                  placeholder="Contoh: 524007"
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono font-bold focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Nama Proyek *</label>
                <input
                  type="text"
                  value={quickProyekForm.nama_proyek}
                  onChange={e => setQuickProyekForm({ ...quickProyekForm, nama_proyek: e.target.value })}
                  placeholder="Contoh: Proyek Camp Accomodation 524007"
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-bold focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Nama Singkat Proyek</label>
                <input
                  type="text"
                  value={quickProyekForm.nama_singkat}
                  onChange={e => setQuickProyekForm({ ...quickProyekForm, nama_singkat: e.target.value })}
                  placeholder="Contoh: Camp Accomodation 524007"
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-bold focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Lokasi Site Proyek</label>
                <input
                  type="text"
                  value={quickProyekForm.lokasi}
                  onChange={e => setQuickProyekForm({ ...quickProyekForm, lokasi: e.target.value })}
                  placeholder="Contoh: Tembagapura, Papua"
                  className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-white font-bold focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowQuickAddProyek(false)} className="btn-secondary">Batal</button>
                <button type="submit" disabled={savingQuickProyek} className="btn-primary">
                  {savingQuickProyek ? 'Menyimpan...' : 'Simpan Kode Proyek'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal-content max-w-sm">
            <div className="p-6 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
                <Shield size={24} style={{ color: '#f87171' }} />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Cabut Akses?</h3>
              <p className="text-sm mb-1" style={{ color: '#94a3b8' }}>
                Akses SI Wajah untuk <strong className="text-white">{confirmDelete.email}</strong> akan dicabut.
              </p>
              <p className="text-xs mb-6" style={{ color: '#64748b' }}>
                User tetap bisa login ke simontok/simonika. Profil SI Wajah akan dihapus.
              </p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setConfirmDelete(null)} className="btn-secondary">Batal</button>
                <button onClick={handleDelete} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200" style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)', boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)' }}>
                  <Trash2 size={14} /> Cabut Akses
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
