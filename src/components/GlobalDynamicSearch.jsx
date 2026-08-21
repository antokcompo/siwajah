import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Search, Users, LayoutDashboard, CalendarDays, Clock, FileWarning, FileSpreadsheet, Settings, Shield, Lock, X, ArrowRight, Command } from 'lucide-react'

const SYSTEM_PAGES = [
  { label: 'Dashboard Utama', path: '/', icon: LayoutDashboard, category: 'Menu' },
  { label: 'Rekap Absensi Harian', path: '/rekap-harian', icon: CalendarDays, category: 'Menu' },
  { label: 'Approval & Rekap Lembur', path: '/approval-lembur', icon: Clock, category: 'Menu' },
  { label: 'Laporan Terlewat & Izin Pekerja', path: '/laporan-izin', icon: FileWarning, category: 'Menu' },
  { label: 'Rekap Bulanan & Gaji', path: '/rekap-bulanan', icon: FileSpreadsheet, category: 'Menu' },
  { label: 'Master Data Karyawan', path: '/master-karyawan', icon: Users, category: 'Menu' },
  { label: 'Kalender & Hari Libur Proyek', path: '/kalender', icon: CalendarDays, category: 'Menu' },
  { label: 'Jadwal Slot Absen', path: '/jadwal-slot', icon: Clock, category: 'Menu' },
  { label: 'Tutup Absen Proyek', path: '/tutup-absen', icon: Lock, category: 'Menu' },
  { label: 'Pengaturan & Konfigurasi', path: '/konfigurasi', icon: Settings, category: 'Menu' },
  { label: 'Audit Log System', path: '/audit-log', icon: Shield, category: 'Menu' },
]

export default function GlobalDynamicSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [resultsKaryawan, setResultsKaryawan] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const navigate = useNavigate()
  const inputRef = useRef(null)

  // Keyboard shortcut listener (Ctrl+K or Cmd+K)
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setResultsKaryawan([])
      setSelectedIndex(0)
    }
  }, [isOpen])

  // Dynamic Search Debounced Fetching
  useEffect(() => {
    if (!query.trim()) {
      setResultsKaryawan([])
      setLoading(false)
      return
    }

    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const q = query.trim().toLowerCase()
        const { data } = await supabase
          .from('absen_karyawan')
          .select('id, nama, jabatan, uid_mesin, status_aktif')
          .or(`nama.ilike.%${q}%,jabatan.ilike.%${q}%,uid_mesin.ilike.%${q}%`)
          .limit(8)

        setResultsKaryawan(data || [])
      } catch (err) {
        console.error('Dynamic Search Error:', err)
      } finally {
        setLoading(false)
      }
    }, 150)

    return () => clearTimeout(timer)
  }, [query])

  // Filter System Pages
  const filteredPages = query.trim()
    ? SYSTEM_PAGES.filter(p => p.label.toLowerCase().includes(query.toLowerCase()) || p.path.toLowerCase().includes(query.toLowerCase()))
    : SYSTEM_PAGES.slice(0, 5)

  // Combine results for keyboard navigation
  const combinedList = [
    ...filteredPages.map(p => ({ type: 'page', data: p })),
    ...resultsKaryawan.map(k => ({ type: 'karyawan', data: k }))
  ]

  function handleSelect(item) {
    setIsOpen(false)
    if (item.type === 'page') {
      navigate(item.data.path)
    } else if (item.type === 'karyawan') {
      navigate(`/master-karyawan?search=${encodeURIComponent(item.data.nama)}`)
    }
  }

  function handleKeyDownModal(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % (combinedList.length || 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + combinedList.length) % (combinedList.length || 1))
    } else if (e.key === 'Enter' && combinedList[selectedIndex]) {
      e.preventDefault()
      handleSelect(combinedList[selectedIndex])
    }
  }

  return (
    <>
      {/* Topbar Search Button / Trigger */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all text-xs font-medium shadow-inner"
        title="Cari dinamis (Ctrl + K)"
      >
        <Search size={14} className="text-cyan-400" />
        <span className="hidden md:inline text-slate-300">Pencarian Dinamis...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-cyan-300">
          <Command size={10} /> K
        </kbd>
      </button>

      {/* Dynamic Search Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-start justify-center pt-16 sm:pt-24 p-4">
          <div
            className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onKeyDown={handleKeyDownModal}
          >
            {/* Search Input Box */}
            <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-slate-950/60">
              <Search size={18} className="text-cyan-400 shrink-0 animate-pulse" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
                placeholder="Ketik nama karyawan, jabatan, NIK/UID, atau nama halaman..."
                className="w-full bg-transparent text-sm text-white focus:outline-none placeholder-slate-500 font-sans font-medium"
              />
              {query && (
                <button onClick={() => setQuery('')} className="p-1 text-slate-400 hover:text-white">
                  <X size={16} />
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="px-2 py-1 text-xs font-bold bg-slate-800 text-slate-300 hover:text-white rounded-lg">
                ESC
              </button>
            </div>

            {/* Results List */}
            <div className="max-h-[60vh] overflow-y-auto p-2 space-y-3 font-sans">
              {loading && (
                <div className="py-6 text-center text-xs text-cyan-400 flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span>Mencari data dinamis...</span>
                </div>
              )}

              {/* Halaman / Menu */}
              {filteredPages.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Menu & Halaman Sistem
                  </div>
                  <div className="space-y-1 mt-1">
                    {filteredPages.map((page, idx) => {
                      const listIdx = idx
                      const isSelected = selectedIndex === listIdx
                      const IconComp = page.icon
                      return (
                        <div
                          key={page.path}
                          onClick={() => handleSelect({ type: 'page', data: page })}
                          onMouseEnter={() => setSelectedIndex(listIdx)}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                            isSelected ? 'bg-cyan-500/20 border border-cyan-400/50 text-white' : 'hover:bg-slate-800/60 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <IconComp size={16} className={isSelected ? 'text-cyan-400' : 'text-slate-400'} />
                            <span className="text-xs font-bold">{page.label}</span>
                          </div>
                          <ArrowRight size={13} className={isSelected ? 'text-cyan-400' : 'opacity-0'} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Data Karyawan */}
              {resultsKaryawan.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                    Karyawan ({resultsKaryawan.length})
                  </div>
                  <div className="space-y-1 mt-1">
                    {resultsKaryawan.map((k, idx) => {
                      const listIdx = filteredPages.length + idx
                      const isSelected = selectedIndex === listIdx
                      return (
                        <div
                          key={k.id}
                          onClick={() => handleSelect({ type: 'karyawan', data: k })}
                          onMouseEnter={() => setSelectedIndex(listIdx)}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                            isSelected ? 'bg-cyan-500/20 border border-cyan-400/50 text-white' : 'hover:bg-slate-800/60 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xs">
                              {k.nama.charAt(0)}
                            </div>
                            <div>
                              <div className="text-xs font-extrabold text-white">{k.nama}</div>
                              <div className="text-[10px] text-cyan-300 font-mono">
                                {k.jabatan || 'Pekerja'} {k.uid_mesin ? `• UID: ${k.uid_mesin}` : ''}
                              </div>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                            Buka Master
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {!loading && query.trim() && combinedList.length === 0 && (
                <div className="py-10 text-center text-slate-400 text-xs">
                  <Search size={28} className="mx-auto mb-2 text-slate-600" />
                  <p className="font-bold text-slate-300">Tidak ada hasil ditemukan untuk "{query}"</p>
                  <p className="text-[11px] text-slate-500 mt-1">Coba kata kunci nama karyawan, jabatan, atau menu lainnya.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-2 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-3">
                <span><kbd className="px-1 bg-slate-900 border border-slate-800 rounded text-slate-300">↑↓</kbd> Navigasi</span>
                <span><kbd className="px-1 bg-slate-900 border border-slate-800 rounded text-slate-300">↵</kbd> Pilih</span>
              </div>
              <span className="text-cyan-400 font-mono font-bold">Pencarian Dinamis SI WAJAH</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
