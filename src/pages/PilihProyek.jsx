import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Building2, MapPin, Users, ArrowRight, Search, Sparkles, Layers, ShieldCheck, CheckCircle2, Clock } from 'lucide-react'

export const DEFAULT_PROJECTS = [
  {
    id: 'prj-001',
    kode: 'PRJ-PP-001',
    nama: 'Proyek Pembangunan Gedung Presisi PT PP (Persero) Tbk',
    nama_singkat: 'Gedung Presisi Jayapura',
    lokasi: 'Jayapura, Papua',
    zona_waktu: 'Asia/Jayapura',
    tz_label: 'WIT (UTC+9)',
    status: 'AKTIF',
    total_karyawan: 120,
    deskripsi: 'Sistem presensi & aktifitas harian pekerja proyek gedung presisi.',
    is_default: true,
  },
  {
    id: 'prj-002',
    kode: 'PRJ-PP-002',
    nama: 'Proyek Gedung Kantor Terpadu IKN (Tahap II)',
    nama_singkat: 'Gedung Terpadu IKN',
    lokasi: 'Nusantara, Kaltim',
    zona_waktu: 'Asia/Makassar',
    tz_label: 'WITA (UTC+8)',
    status: 'AKTIF',
    total_karyawan: 85,
    deskripsi: 'Sistem presensi & aktifitas harian pekerja kawasan pusat pemerintahan.',
    is_default: false,
  },
  {
    id: 'prj-003',
    kode: 'PRJ-PP-003',
    nama: 'Proyek Kawasan Komersial & Perkantoran Jakarta',
    nama_singkat: 'Kawasan Komersial Jakarta',
    lokasi: 'Jakarta Selatan, DKI',
    zona_waktu: 'Asia/Jakarta',
    tz_label: 'WIB (UTC+7)',
    status: 'AKTIF',
    total_karyawan: 150,
    deskripsi: 'Sistem presensi & aktifitas harian pekerja gedung perkantoran.',
    is_default: false,
  },
]

export function getActiveProject() {
  try {
    const saved = localStorage.getItem('siwajah_active_project')
    if (saved) return JSON.parse(saved)
  } catch (e) {}
  return DEFAULT_PROJECTS[0]
}

export function setActiveProject(project) {
  localStorage.setItem('siwajah_active_project', JSON.stringify(project))
}

export default function PilihProyek() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const activeProject = getActiveProject()

  useEffect(() => {
    document.title = 'Pilih Proyek — SI WAJAH'
    if (activeProject) {
      setSelectedId(activeProject.id)
    }
  }, [])

  const filteredProjects = DEFAULT_PROJECTS.filter(p =>
    p.nama.toLowerCase().includes(search.toLowerCase()) ||
    p.kode.toLowerCase().includes(search.toLowerCase()) ||
    p.lokasi.toLowerCase().includes(search.toLowerCase())
  )

  function handleSelect(project) {
    setActiveProject(project)
    setSelectedId(project.id)
    navigate('/siwajah')
  }

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 font-sans selection:bg-cyan-500 selection:text-white relative overflow-hidden flex flex-col justify-between">
      
      {/* Ambient background glows */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute top-1/2 -right-40 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[160px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:32px_32px] opacity-20" />
      </div>

      {/* Header Bar */}
      <header className="relative z-10 border-b border-white/10 bg-slate-950/60 backdrop-blur-2xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/30">
            <Layers className="w-5 h-5 text-cyan-200" />
          </div>
          <div>
            <h1 className="text-base font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-300 tracking-wider">
              PRISMA INTEGRATED
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">SI WAJAH • Management Multi Proyek</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="hidden sm:inline">Masuk sebagai: <strong className="text-white">{user?.email || 'Admin'}</strong></span>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-5xl mx-auto w-full px-6 py-10 my-auto">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Pilih Ruang Kerja Proyek</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-2">
            Pilih Proyek Aktif Anda
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Silakan pilih proyek yang akan dikelola. Semua rekap presensi, master karyawan, dan kalender kerja akan disesuaikan dengan proyek yang dipilih.
          </p>

          {/* Search Box */}
          <div className="mt-6 relative max-w-md mx-auto">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari proyek berdasarkan nama, kode, atau lokasi..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-white/10 rounded-2xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60 transition-all shadow-inner"
            />
          </div>
        </div>

        {/* Project Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {filteredProjects.map((project) => {
            const isSelected = selectedId === project.id
            return (
              <div
                key={project.id}
                onClick={() => handleSelect(project)}
                className={`group relative rounded-3xl p-6 cursor-pointer transition-all duration-300 border backdrop-blur-xl flex flex-col justify-between ${
                  isSelected
                    ? 'bg-cyan-950/40 border-cyan-400 shadow-[0_0_30px_rgba(6,182,212,0.25)] ring-1 ring-cyan-400/50'
                    : 'bg-slate-900/50 border-white/10 hover:border-cyan-500/50 hover:bg-slate-900/80 hover:shadow-xl'
                }`}
              >
                {/* Active Tag */}
                {isSelected && (
                  <div className="absolute -top-3 right-5 px-3 py-0.5 rounded-full bg-cyan-400 text-slate-950 text-[10px] font-black tracking-wider uppercase shadow-md flex items-center gap-1">
                    <CheckCircle2 size={12} /> Aktif Sekarang
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-cyan-300">
                      {project.kode}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <Clock size={11} /> {project.tz_label}
                    </span>
                  </div>

                  <h3 className="text-lg font-extrabold text-white group-hover:text-cyan-300 transition-colors leading-snug mb-2">
                    {project.nama}
                  </h3>

                  <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed font-normal">
                    {project.deskripsi}
                  </p>
                </div>

                <div className="space-y-3 pt-4 border-t border-white/10">
                  <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <MapPin size={14} className="text-cyan-400" /> {project.lokasi}
                    </span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <Users size={14} className="text-blue-400" /> {project.total_karyawan} Pekerja
                    </span>
                  </div>

                  <button
                    type="button"
                    className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      isSelected
                        ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/30'
                        : 'bg-white/5 text-slate-300 group-hover:bg-cyan-500/20 group-hover:text-cyan-300'
                    }`}
                  >
                    <span>Masuk Ruang Kerja</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-slate-950/60 backdrop-blur-2xl px-6 py-4 text-center text-xs text-slate-500">
        Enterprise Multi-Project System v2.0 • PT PP (Persero) Tbk
      </footer>
    </div>
  )
}
