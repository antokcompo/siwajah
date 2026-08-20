import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Search, UserPlus, Pencil, Trash2, X, Users, Shield, CheckCircle, AlertTriangle, Eye, EyeOff, KeyRound, Plus } from 'lucide-react'

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
  const [form, setForm] = useState({ user_id: '', nama: '', role: 'atasan' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(null)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', password: '', confirmPassword: '', nama: '', role: 'atasan' })
  const [creating, setCreating] = useState(false)

  const [showResetModal, setShowResetModal] = useState(false)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetForm, setResetForm] = useState({ password: '', confirmPassword: '' })
  const [resetting, setResetting] = useState(false)

  useEffect(() => { load() }, [])

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
    })
    setShowModal(true)
  }

  function openEdit(u) {
    setEditing(u)
    setForm({ user_id: u.id, nama: u.nama, role: u.role })
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

    const { error: err } = await supabase.rpc('absen_delete_user_profile', {
      p_user_id: confirmDelete.id,
    })

    if (err) {
      setError(err.message)
      setConfirmDelete(null)
      return
    }

    setConfirmDelete(null)
    setSuccess('Akses user ke SI Wajah berhasil dicabut')
    setTimeout(() => setSuccess(''), 3000)
    load()
  }

  function openCreateUser() {
    setCreateForm({ email: '', password: '', confirmPassword: '', nama: '', role: 'atasan' })
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
    const { data, error: err } = await supabase.rpc('absen_create_auth_user', {
      p_email: createForm.email,
      p_password: createForm.password,
      p_nama: createForm.nama,
      p_role: createForm.role,
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
    setSuccess('User baru berhasil dibuat. User dapat langsung login di portal SI Wajah!')
    setTimeout(() => setSuccess(''), 4000)
    load()
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
                    <tr><td colSpan={7} className="px-5 py-12 text-center" style={{ color: '#475569' }}>
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
