import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO, getDay } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { Calendar, Shield, Sun, Moon, Coffee, ChevronLeft, ChevronRight, Edit3, Plus, Save, UserCheck, Search, Info, CheckCircle2, Clock } from 'lucide-react'
import { getActiveProject } from './PilihProyek'

export default function RosterSecurity() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [securityList, setSecurityList] = useState([])
  const [rosterData, setRosterData] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Modal Atur Shift
  const [showModal, setShowModal] = useState(false)
  const [modalForm, setModalForm] = useState({
    karyawan_id: '',
    tanggal_mulai: format(new Date(), 'yyyy-MM-dd'),
    tanggal_selesai: format(new Date(), 'yyyy-MM-dd'),
    shift: 'PAGI'
  })
  const [savingModal, setSavingModal] = useState(false)
  const [message, setMessage] = useState('')

  const bulan = currentDate.getMonth() + 1
  const tahun = currentDate.getFullYear()

  useEffect(() => {
    loadData()
  }, [bulan, tahun])

  async function loadData() {
    setLoading(true)
    setMessage('')
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    const start = format(startOfMonth(currentDate), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentDate), 'yyyy-MM-dd')

    // Fetch active Security personnel
    const { data: emps } = await supabase
      .from('absen_karyawan')
      .select('id, nama, uid_mesin, jabatan, atasan_id')
      .eq('kode_proyek', activeKode)
      .or('jabatan.ilike.%security%,jabatan.ilike.%satpam%,jabatan.ilike.%sec%')
      .eq('status_aktif', true)
      .order('nama')

    setSecurityList(emps || [])

    if ((emps || []).length === 0) {
      setRosterData([])
      setLoading(false)
      return
    }

    const kIds = (emps || []).map(e => e.id)

    // Fetch Roster
    const { data: roster, error: rpcErr } = await supabase.rpc('absen_get_roster_security', {
      p_start: start,
      p_end: end,
      p_kode_proyek: activeKode
    })

    if (rpcErr || !roster) {
      const { data: fallback } = await supabase
        .from('absen_roster_security')
        .select('*')
        .in('karyawan_id', kIds)
        .gte('tanggal', start)
        .lte('tanggal', end)
      setRosterData(fallback || [])
    } else {
      setRosterData(roster || [])
    }

    setLoading(false)
  }

  const days = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentDate),
      end: endOfMonth(currentDate)
    })
  }, [currentDate])

  // Map per date shift summary
  const dayRosterMap = useMemo(() => {
    const map = {}
    rosterData.forEach(r => {
      const ds = r.tanggal
      if (!map[ds]) map[ds] = { PAGI: [], MALAM: [], OFF: [] }
      const shiftKey = (r.shift || 'PAGI').toUpperCase()
      if (map[ds][shiftKey]) {
        map[ds][shiftKey].push(r)
      }
    })
    return map
  }, [rosterData])

  // Selected Date Roster Details (e.g. 31/08/2026 Case Study)
  const selectedDateDetails = useMemo(() => {
    if (!selectedDate) return { pagi: [], malam: [], off: [] }

    const dayShifts = dayRosterMap[selectedDate] || { PAGI: [], MALAM: [], OFF: [] }
    const assignedIds = new Set([
      ...dayShifts.PAGI.map(x => x.karyawan_id || x.id),
      ...dayShifts.MALAM.map(x => x.karyawan_id || x.id),
      ...dayShifts.OFF.map(x => x.karyawan_id || x.id)
    ])

    // Filter Security personnel by search
    const filteredEmps = securityList.filter(e => {
      if (!searchQuery) return true
      return e.nama.toLowerCase().includes(searchQuery.toLowerCase())
    })

    const pagi = []
    const malam = []
    const off = []

    filteredEmps.forEach(emp => {
      const rItem = rosterData.find(r => (r.karyawan_id === emp.id || r.id === emp.id) && r.tanggal === selectedDate)
      const shift = rItem ? (rItem.shift || 'PAGI').toUpperCase() : 'PAGI' // default Pagi if unassigned

      if (shift === 'PAGI') pagi.push(emp)
      else if (shift === 'MALAM') malam.push(emp)
      else off.push(emp)
    })

    return { pagi, malam, off }
  }, [selectedDate, dayRosterMap, securityList, rosterData, searchQuery])

  function handleOpenModal(empId = '') {
    const emp = empId || (securityList[0]?.id || '')
    setModalForm({
      karyawan_id: emp,
      tanggal_mulai: selectedDate || format(new Date(), 'yyyy-MM-dd'),
      tanggal_selesai: selectedDate || format(new Date(), 'yyyy-MM-dd'),
      shift: 'PAGI'
    })
    setShowModal(true)
  }

  async function handleSaveModal(e) {
    e.preventDefault()
    setSavingModal(true)
    setMessage('')

    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    try {
      const startD = parseISO(modalForm.tanggal_mulai)
      const endD = parseISO(modalForm.tanggal_selesai)
      const rangeDays = eachDayOfInterval({ start: startD, end: endD })

      const payload = rangeDays.map(d => ({
        karyawan_id: modalForm.karyawan_id,
        tanggal: format(d, 'yyyy-MM-dd'),
        shift: modalForm.shift
      }))

      const { error } = await supabase.rpc('absen_save_roster_security', {
        p_data: payload,
        p_kode_proyek: activeKode
      })

      if (error) throw error

      setMessage(`Jadwal shift berhasil diperbarui!`)
      setShowModal(false)
      await loadData()
    } catch (err) {
      setMessage('Gagal menyimpan shift: ' + err.message)
    } finally {
      setSavingModal(false)
    }
  }

  function prevMonth() {
    setCurrentDate(new Date(tahun, bulan - 2, 1))
  }

  function nextMonth() {
    setCurrentDate(new Date(tahun, bulan, 1))
  }

  const activeProj = getActiveProject()

  return (
    <div>
      {/* Header */}
      <div className="page-header flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Roster Jaga Security (2 Shift)</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              Shift Pagi & Shift Malam
            </span>
          </div>
          <p className="text-gray-400 text-xs mt-0.5">
            Jadwal jaga Security/Satpam proyek {activeProj?.nama_singkat || activeProj?.kode || '524006'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleOpenModal()}
            className="btn-primary flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs px-4 py-2 rounded-xl shadow-lg shadow-cyan-900/30"
          >
            <Plus size={16} /> Atur Shift Jaga
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl mb-4 text-xs font-medium flex items-center gap-2 ${
          message.startsWith('Gagal')
            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
        }`}>
          <Info size={16} /> {message}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Kalender Roster */}
        <div className="lg:col-span-7 space-y-4">
          <div className="card p-5 bg-slate-900/90 border border-slate-800 rounded-2xl">
            {/* Controls Month */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Shield size={20} className="text-cyan-400" />
                <h2 className="text-base font-bold text-slate-100">
                  {format(currentDate, 'MMMM yyyy', { locale: localeId })}
                </h2>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={prevMonth}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => {
                    const today = new Date()
                    setCurrentDate(today)
                    setSelectedDate(format(today, 'yyyy-MM-dd'))
                  }}
                  className="px-3 py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/30 text-xs font-medium"
                >
                  Hari Ini ({format(new Date(), 'd MMM yyyy', { locale: localeId })})
                </button>
                <button
                  onClick={nextMonth}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Calendar Table Header */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-400 mb-2">
              <div>Min</div><div>Sen</div><div>Sel</div><div>Rab</div><div>Kam</div><div>Jum</div><div>Sab</div>
            </div>

            {/* Calendar Days Grid */}
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: getDay(startOfMonth(currentDate)) }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[76px] rounded-xl border border-transparent opacity-0 pointer-events-none" />
                ))}
                {days.map(d => {
                  const ds = format(d, 'yyyy-MM-dd')
                  const isSelected = selectedDate === ds
                  const isToday = isSameDay(d, new Date())

                  const dayShifts = dayRosterMap[ds] || { PAGI: [], MALAM: [], OFF: [] }
                  const pagiCount = dayShifts.PAGI.length
                  const malamCount = dayShifts.MALAM.length
                  const offCount = dayShifts.OFF.length

                  return (
                    <button
                      key={ds}
                      onClick={() => setSelectedDate(ds)}
                      className={`min-h-[76px] p-2 rounded-xl border text-left transition flex flex-col justify-between ${
                        isSelected
                          ? 'bg-cyan-950/90 border-cyan-400 ring-2 ring-cyan-400/30 shadow-lg shadow-cyan-950/50'
                          : isToday
                          ? 'bg-slate-800/90 border-amber-500/50'
                          : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-xs font-bold ${isSelected ? 'text-cyan-300' : 'text-slate-200'}`}>
                          {format(d, 'd')}
                        </span>
                      </div>

                      <div className="space-y-0.5 text-[10px] font-medium mt-1">
                        <div className="flex items-center gap-1 text-emerald-400">
                          <Sun size={10} /> <span>Pagi ({pagiCount})</span>
                        </div>
                        <div className="flex items-center gap-1 text-purple-400">
                          <Moon size={10} /> <span>Malam ({malamCount})</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Shift Rules Card */}
            <div className="mt-5 p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-2">
              <div className="font-semibold text-slate-300 flex items-center gap-2">
                <Clock size={14} className="text-amber-400" /> Ketentuan Shift Jam Absen Security:
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-400">
                <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/20">
                  <span className="font-bold text-emerald-300 flex items-center gap-1.5 mb-1">
                    <Sun size={12} /> Shift Pagi (7 Slot):
                  </span>
                  <div className="text-[11px] text-emerald-200/90">
                    06.00, 08.00, 10.00, 11.30, 13.00, 15.00, 17.00
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-500/20">
                  <span className="font-bold text-purple-300 flex items-center gap-1.5 mb-1">
                    <Moon size={12} /> Shift Malam (6 Slot Lintas Hari):
                  </span>
                  <div className="text-[11px] text-purple-200/90">
                    17.00, 19.00, 23.00, 01.00 (+1), 03.00 (+1), 06.00 (+1)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Detail Panel Jaga Harian (Studi Kasus 31/08/2026) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card p-5 bg-slate-900/90 border border-cyan-500/30 rounded-2xl shadow-xl shadow-cyan-950/20">
            {/* Header Selected Date */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div>
                <span className="text-[11px] uppercase font-bold tracking-wider text-cyan-400">
                  Detail Personel Jaga Proyek
                </span>
                <h3 className="text-lg font-extrabold text-slate-100">
                  {selectedDate
                    ? format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: localeId })
                    : 'Pilih Tanggal'}
                </h3>
              </div>
            </div>

            {/* Search Personel */}
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama personel security..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            {/* 3 Shift Cards */}
            <div className="space-y-4">
              {/* 1. Shift Pagi */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/60 to-slate-950 border border-emerald-500/30 shadow-md">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                      <Sun size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-emerald-300">Shift Pagi</h4>
                      <p className="text-[10px] text-emerald-400/80">Jam 06.00 — 17.00 (7 Slot Scan)</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    {selectedDateDetails.pagi.length} Personel
                  </span>
                </div>

                {selectedDateDetails.pagi.length === 0 ? (
                  <div className="text-[11px] text-slate-500 italic py-2">Tidak ada personil bertugas di Shift Pagi</div>
                ) : (
                  <div className="space-y-1.5">
                    {selectedDateDetails.pagi.map(emp => (
                      <div key={emp.id} className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Shield size={14} className="text-emerald-400" />
                          <div>
                            <span className="text-xs font-bold text-slate-100 block">{emp.nama}</span>
                            <span className="text-[10px] text-slate-400">UID: {emp.uid_mesin || '-'} | {emp.jabatan}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleOpenModal(emp.id)}
                          className="p-1 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition"
                          title="Ubah Shift"
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Shift Malam */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-purple-950/60 to-slate-950 border border-purple-500/30 shadow-md">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                      <Moon size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-purple-300">Shift Malam</h4>
                      <p className="text-[10px] text-purple-400/80">Jam 17.00 — 06.00 Besok (6 Slot Lintas Hari)</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    {selectedDateDetails.malam.length} Personel
                  </span>
                </div>

                {selectedDateDetails.malam.length === 0 ? (
                  <div className="text-[11px] text-slate-500 italic py-2">Tidak ada personil bertugas di Shift Malam</div>
                ) : (
                  <div className="space-y-1.5">
                    {selectedDateDetails.malam.map(emp => (
                      <div key={emp.id} className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Shield size={14} className="text-purple-400" />
                          <div>
                            <span className="text-xs font-bold text-slate-100 block">{emp.nama}</span>
                            <span className="text-[10px] text-slate-400">UID: {emp.uid_mesin || '-'} | {emp.jabatan}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleOpenModal(emp.id)}
                          className="p-1 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition"
                          title="Ubah Shift"
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Shift OFF */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 shadow-md">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center font-bold">
                      <Coffee size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-300">Libur / OFF</h4>
                      <p className="text-[10px] text-slate-400">Personel Istirahat / Lepas Jaga</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
                    {selectedDateDetails.off.length} Personel
                  </span>
                </div>

                {selectedDateDetails.off.length === 0 ? (
                  <div className="text-[11px] text-slate-500 italic py-2">Semua personel bertugas</div>
                ) : (
                  <div className="space-y-1.5">
                    {selectedDateDetails.off.map(emp => (
                      <div key={emp.id} className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Shield size={14} className="text-slate-500" />
                          <div>
                            <span className="text-xs font-medium text-slate-300 block">{emp.nama}</span>
                            <span className="text-[10px] text-slate-500">{emp.jabatan}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleOpenModal(emp.id)}
                          className="p-1 rounded-md text-slate-400 hover:text-cyan-300 hover:bg-slate-800 transition"
                          title="Ubah Shift"
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Atur Shift Jaga Security */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border-2 border-cyan-400 rounded-2xl shadow-2xl overflow-hidden p-6 text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <h3 className="text-base font-bold text-cyan-300 flex items-center gap-2">
                <Shield size={18} /> Atur Shift Jaga Security
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Personel Security</label>
                <select
                  value={modalForm.karyawan_id}
                  onChange={e => setModalForm({ ...modalForm, karyawan_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:border-cyan-400 focus:outline-none"
                  required
                >
                  {securityList.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nama} ({emp.jabatan})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Tanggal Mulai</label>
                  <input
                    type="date"
                    value={modalForm.tanggal_mulai}
                    onChange={e => setModalForm({ ...modalForm, tanggal_mulai: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:border-cyan-400 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Tanggal Selesai</label>
                  <input
                    type="date"
                    value={modalForm.tanggal_selesai}
                    onChange={e => setModalForm({ ...modalForm, tanggal_selesai: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:border-cyan-400 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">Pilih Shift Jaga</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setModalForm({ ...modalForm, shift: 'PAGI' })}
                    className={`py-2.5 px-3 rounded-xl border font-bold text-center transition flex flex-col items-center gap-1 ${
                      modalForm.shift === 'PAGI'
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-400 ring-2 ring-emerald-400/30'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <Sun size={16} /> Shift Pagi
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalForm({ ...modalForm, shift: 'MALAM' })}
                    className={`py-2.5 px-3 rounded-xl border font-bold text-center transition flex flex-col items-center gap-1 ${
                      modalForm.shift === 'MALAM'
                        ? 'bg-purple-950 text-purple-300 border-purple-400 ring-2 ring-purple-400/30'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <Moon size={16} /> Shift Malam
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalForm({ ...modalForm, shift: 'OFF' })}
                    className={`py-2.5 px-3 rounded-xl border font-bold text-center transition flex flex-col items-center gap-1 ${
                      modalForm.shift === 'OFF'
                        ? 'bg-slate-800 text-slate-200 border-slate-600 ring-2 ring-slate-400/30'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <Coffee size={16} /> Libur (OFF)
                  </button>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingModal}
                  className="btn-primary px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-2"
                >
                  {savingModal ? 'Saving...' : <Save size={16} />} Simpan Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
