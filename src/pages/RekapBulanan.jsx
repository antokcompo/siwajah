import { useEffect, useState, useMemo, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Calculator, Lock, Download, Unlock, FileSpreadsheet, Users, CheckCircle, Eye, Info, X, Calendar, Clock, DollarSign, Building2 } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getActiveProject } from './PilihProyek'

export default function RekapBulanan() {
  const now = new Date()
  const [bulan, setBulan] = useState(now.getMonth() + 1)
  const [tahun, setTahun] = useState(now.getFullYear())
  const [data, setData] = useState([])
  const [mandorMap, setMandorMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [periode, setPeriode] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [detailModalItem, setDetailModalItem] = useState(null)
  const [detailHarian, setDetailHarian] = useState([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [potonganInput, setPotonganInput] = useState('0')
  const [savingPotongan, setSavingPotongan] = useState(false)
  const { profile } = useAuth()

  const namaBulan = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
  const fmt = n => new Intl.NumberFormat('id-ID').format(Math.round(n || 0))

  async function savePotongan(item) {
    if (!item) return
    setSavingPotongan(true)
    const newPotongan = Math.max(0, Number(potonganInput) || 0)
    const newTotalGaji = Number(item.gaji_pokok || 0) + Number(item.gaji_lembur || 0) + Number(item.tunjangan || 0) - newPotongan

    const { error } = await supabase
      .from('absen_gaji_bulanan')
      .update({
        potongan: newPotongan,
        total_gaji: newTotalGaji
      })
      .eq('id', item.id)

    setSavingPotongan(false)
    if (error) {
      alert('Gagal menyimpan potongan: ' + error.message)
    } else {
      setDetailModalItem(prev => prev ? { ...prev, potongan: newPotongan, total_gaji: newTotalGaji } : null)
      setData(prev => prev.map(d => d.id === item.id ? { ...d, potongan: newPotongan, total_gaji: newTotalGaji } : d))
    }
  }

  async function openDetailModal(item) {
    setDetailModalItem(item)
    setPotonganInput(String(item.potongan || 0))
    setLoadingDetail(true)
    setDetailHarian([])

    const padBulan = String(bulan).padStart(2, '0')
    const startDate = `${tahun}-${padBulan}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const endDate = `${tahun}-${padBulan}-${String(lastDay).padStart(2, '0')}`

    const [harianRes, scanRes, laporanRes] = await Promise.all([
      supabase
        .from('absen_harian')
        .select('id, tanggal, jam_masuk, jam_pulang, status, jam_lembur, status_lembur, catatan')
        .eq('karyawan_id', item.karyawan_id)
        .gte('tanggal', startDate)
        .lte('tanggal', endDate)
        .order('tanggal', { ascending: false }),
      supabase
        .from('absen_scan_wajah')
        .select('tanggal, slot_id, waktu_scan')
        .eq('karyawan_id', item.karyawan_id)
        .gte('tanggal', startDate)
        .lte('tanggal', endDate),
      supabase
        .from('absen_laporan_terlewat')
        .select('tanggal, slot_id, status')
        .eq('karyawan_id', item.karyawan_id)
        .gte('tanggal', startDate)
        .lte('tanggal', endDate)
    ])

    const harianList = harianRes.data || []
    const scanList = scanRes.data || []
    const laporanList = laporanRes.data || []

    // Calculate per-day slot statistics including min/max scan times
    const statsByDate = {}
    scanList.forEach(s => {
      if (!statsByDate[s.tanggal]) statsByDate[s.tanggal] = { slots: new Set(), pendingCount: 0, minScan: null, maxScan: null }
      statsByDate[s.tanggal].slots.add(s.slot_id)

      if (s.waktu_scan) {
        const wObj = new Date(s.waktu_scan)
        const tStr = !isNaN(wObj.getTime())
          ? wObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          : null
        if (tStr) {
          if (!statsByDate[s.tanggal].minScan || tStr < statsByDate[s.tanggal].minScan) statsByDate[s.tanggal].minScan = tStr
          if (!statsByDate[s.tanggal].maxScan || tStr > statsByDate[s.tanggal].maxScan) statsByDate[s.tanggal].maxScan = tStr
        }
      }
    })

    laporanList.forEach(l => {
      if (!statsByDate[l.tanggal]) statsByDate[l.tanggal] = { slots: new Set(), pendingCount: 0, minScan: null, maxScan: null }
      if (l.status === 'APPROVED') {
        statsByDate[l.tanggal].slots.add(l.slot_id)
      } else if (l.status === 'PENDING') {
        statsByDate[l.tanggal].pendingCount += 1
      }
    })

    // Collect all distinct dates where employee has any record or scan
    const allDatesSet = new Set([
      ...harianList.map(h => h.tanggal),
      ...scanList.map(s => s.tanggal),
      ...laporanList.map(l => l.tanggal)
    ])

    const sortedDates = Array.from(allDatesSet).sort().reverse()

    const harianByDate = {}
    harianList.forEach(h => { harianByDate[h.tanggal] = h })

    const enrichedHarian = sortedDates.map(tgl => {
      const h = harianByDate[tgl] || { id: tgl, tanggal: tgl, jam_masuk: null, jam_pulang: null, status: 'PRO_RATA', jam_lembur: 0 }
      const st = statsByDate[tgl] || { slots: new Set(), pendingCount: 0, minScan: null, maxScan: null }
      const verifiedSlots = st.slots.size
      const pendingCount = st.pendingCount

      const jamMasuk = h.jam_masuk || st.minScan || '-'
      const jamPulang = h.jam_pulang || (st.maxScan !== st.minScan ? st.maxScan : '-')

      return {
        ...h,
        jam_masuk: jamMasuk,
        jam_pulang: jamPulang,
        verifiedSlots,
        pendingCount,
        bobot: 1.0
      }
    })

    setDetailHarian(enrichedHarian)
    setLoadingDetail(false)
  }

  useEffect(() => {
    load()
    const handleStorage = () => load()
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [bulan, tahun])

  async function load() {
    setLoading(true)
    setError('')
    setSelected(new Set())

    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    const { data: karyawanProyek } = await supabase
      .from('absen_karyawan')
      .select('id, nama, jabatan, atasan_id, gaji_bulanan, tunjangan, status_aktif')
      .eq('kode_proyek', activeKode)
      .eq('status_aktif', true)

    const kIds = (karyawanProyek || []).map(k => k.id)

    if (kIds.length === 0) {
      setData([])
      setPeriode(null)
      setMandorMap({})
      setLoading(false)
      return
    }

    const padBulan = String(bulan).padStart(2, '0')
    const startDate = `${tahun}-${padBulan}-01`
    const lastDay = new Date(tahun, bulan, 0).getDate()
    const endDate = `${tahun}-${padBulan}-${String(lastDay).padStart(2, '0')}`

    const [gajiRes, periodeRes, mandorRes, scanRes, harianRes, laporanRes, daftarLemburRes, slotRes, kalenderRes] = await Promise.all([
      supabase.from('absen_gaji_bulanan')
        .select('*, absen_karyawan(nama, jabatan, atasan_id, gaji_bulanan, tunjangan)')
        .in('karyawan_id', kIds)
        .eq('bulan', bulan).eq('tahun', tahun)
        .order('absen_karyawan(nama)'),
      supabase.from('absen_periode_gaji')
        .select('*').eq('bulan', bulan).eq('tahun', tahun).maybeSingle(),
      supabase.from('absen_karyawan')
        .select('id, nama')
        .eq('kode_proyek', activeKode)
        .ilike('jabatan', '%mandor%')
        .eq('status_aktif', true),
      supabase.from('absen_scan_wajah')
        .select('karyawan_id, tanggal, slot_id, absen_jadwal_slot(jenis)')
        .in('karyawan_id', kIds)
        .gte('tanggal', startDate).lte('tanggal', endDate),
      supabase.from('absen_harian')
        .select('karyawan_id, tanggal, status, jam_masuk, jam_pulang, jam_lembur, status_lembur')
        .in('karyawan_id', kIds)
        .gte('tanggal', startDate).lte('tanggal', endDate),
      supabase.from('absen_laporan_terlewat')
        .select('karyawan_id, tanggal, slot_id, absen_jadwal_slot(jenis)')
        .in('karyawan_id', kIds)
        .eq('status', 'APPROVED')
        .gte('tanggal', startDate).lte('tanggal', endDate),
      supabase.from('absen_daftar_lembur')
        .select('karyawan_id, tanggal, status')
        .in('karyawan_id', kIds)
        .gte('tanggal', startDate).lte('tanggal', endDate),
      supabase.from('absen_jadwal_slot')
        .select('id, jenis, aktif')
        .eq('aktif', true),
      supabase.from('absen_kalender')
        .select('tanggal')
        .eq('jenis_hari', 'kerja')
        .gte('tanggal', startDate).lte('tanggal', endDate)
    ])

    const empAttendedDates = {}
    const addDate = (kid, tgl) => {
      if (!kid || !tgl) return
      if (!empAttendedDates[kid]) empAttendedDates[kid] = new Set()
      empAttendedDates[kid].add(tgl)
    }

    const empDailySlots = {}
    const addSlot = (kid, tgl, slotId, jenis) => {
      const j = (jenis || '').toLowerCase()
      if (j.includes('lembur')) return
      if (!kid || !tgl || !slotId) return
      if (!empDailySlots[kid]) empDailySlots[kid] = {}
      if (!empDailySlots[kid][tgl]) empDailySlots[kid][tgl] = new Set()
      empDailySlots[kid][tgl].add(slotId)
    }

    ;(scanRes.data || []).forEach(s => {
      addDate(s.karyawan_id, s.tanggal)
      addSlot(s.karyawan_id, s.tanggal, s.slot_id, s.absen_jadwal_slot?.jenis)
    })
    ;(harianRes.data || []).forEach(h => {
      if (h.status !== 'TIDAK_ADA_SCAN' || h.jam_masuk || h.jam_pulang) {
        addDate(h.karyawan_id, h.tanggal)
      }
    })
    ;(laporanRes.data || []).forEach(l => {
      addDate(l.karyawan_id, l.tanggal)
      addSlot(l.karyawan_id, l.tanggal, l.slot_id, l.absen_jadwal_slot?.jenis)
    })
    ;(daftarLemburRes.data || []).forEach(dl => addDate(dl.karyawan_id, dl.tanggal))

    // Map approved overtime registrations per worker & date
    const approvedDaftarSet = new Set()
    ;(daftarLemburRes.data || []).forEach(dl => {
      if (dl.status === 'APPROVED') {
        approvedDaftarSet.add(`${dl.karyawan_id}_${dl.tanggal}`)
      }
    })

    const empApprovedOvertime = {}
    ;(harianRes.data || []).forEach(h => {
      const key = `${h.karyawan_id}_${h.tanggal}`
      const isApproved = (h.status_lembur === 'APPROVED') || approvedDaftarSet.has(key)
      if (isApproved) {
        let hrs = Number(h.jam_lembur || 0)
        if (hrs === 0 && approvedDaftarSet.has(key)) hrs = 4.0
        if (hrs > 0) {
          if (!empApprovedOvertime[h.karyawan_id]) empApprovedOvertime[h.karyawan_id] = 0
          empApprovedOvertime[h.karyawan_id] += hrs
        }
      }
    })

    const regSlotCount = (slotRes.data || []).filter(s => !(s.jenis || '').toLowerCase().includes('lembur')).length || 6
    const hariKerjaKalender = (kalenderRes.data || []).length || 26

    const empTotalWeight = {}
    Object.entries(empDailySlots).forEach(([kid, datesObj]) => {
      let sumWeight = 0
      Object.values(datesObj).forEach(slotSet => {
        sumWeight += Math.min(1.0, slotSet.size / Number(regSlotCount))
      })
      empTotalWeight[kid] = sumWeight
    })

    const existingGajiEmpIds = new Set((gajiRes.data || []).map(g => g.karyawan_id))
    const missingEmps = (karyawanProyek || []).filter(k => !existingGajiEmpIds.has(k.id))

    const missingRows = missingEmps.map(k => ({
      id: `temp_${k.id}`,
      karyawan_id: k.id,
      bulan,
      tahun,
      hari_kerja: 0,
      jam_lembur_total: 0,
      gaji_pokok: 0,
      gaji_lembur: 0,
      tunjangan: Number(k.tunjangan || 0),
      potongan: 0,
      total_gaji: 0,
      status: 'draft',
      absen_karyawan: k
    }))

    const rawGajiList = [...(gajiRes.data || []), ...missingRows]

    const enrichedGajiList = rawGajiList.map(item => {
      const kid = item.karyawan_id
      const distinctCount = empAttendedDates[kid] ? empAttendedDates[kid].size : 0
      const totalWeight = empTotalWeight[kid] !== undefined ? empTotalWeight[kid] : distinctCount
      const calcJamLembur = empApprovedOvertime[kid] !== undefined ? empApprovedOvertime[kid] : Number(item.jam_lembur_total || 0)

      const gajiBulanan = Number(item.absen_karyawan?.gaji_bulanan || 0)
      const isFull = totalWeight >= hariKerjaKalender
      const gajiHarian = gajiBulanan / hariKerjaKalender

      let calcGajiLembur = Number(item.gaji_lembur || 0)
      if (calcJamLembur > 0) {
        calcGajiLembur = Math.round(calcJamLembur * (gajiBulanan / 208))
      }

      if (item.status === 'draft') {
        const gajiPokok = isFull ? gajiBulanan : Math.round((gajiHarian * totalWeight) / 100) * 100
        const totalGaji = gajiPokok + calcGajiLembur + Number(item.tunjangan || 0) - Number(item.potongan || 0)

        if (typeof item.id === 'string' && item.id.startsWith('temp_')) {
          supabase
            .from('absen_gaji_bulanan')
            .upsert({
              karyawan_id: kid,
              bulan,
              tahun,
              hari_kerja: distinctCount,
              jam_lembur_total: calcJamLembur,
              gaji_pokok: gajiPokok,
              gaji_lembur: calcGajiLembur,
              tunjangan: Number(item.tunjangan || item.absen_karyawan?.tunjangan || 0),
              potongan: Number(item.potongan || 0),
              total_gaji: totalGaji,
              status: 'draft'
            }, { onConflict: 'karyawan_id, bulan, tahun' })
            .then(() => {})
        } else if (item.hari_kerja !== distinctCount || item.gaji_pokok !== gajiPokok || item.gaji_lembur !== calcGajiLembur || item.jam_lembur_total !== calcJamLembur) {
          supabase
            .from('absen_gaji_bulanan')
            .update({
              hari_kerja: distinctCount,
              jam_lembur_total: calcJamLembur,
              gaji_pokok: gajiPokok,
              gaji_lembur: calcGajiLembur,
              total_gaji: totalGaji
            })
            .eq('id', item.id)
            .then(() => {})
        }

        return {
          ...item,
          hari_kerja: distinctCount,
          jam_lembur_total: calcJamLembur,
          gaji_pokok: gajiPokok,
          gaji_lembur: calcGajiLembur,
          total_gaji: totalGaji
        }
      }
      return {
        ...item,
        jam_lembur_total: calcJamLembur,
        gaji_lembur: calcGajiLembur,
        total_gaji: Number(item.gaji_pokok || 0) + calcGajiLembur + Number(item.tunjangan || 0) - Number(item.potongan || 0)
      }
    })

    setData(enrichedGajiList)
    setPeriode(periodeRes.data)

    const mMap = {}
    ;(mandorRes.data || []).forEach(m => { mMap[m.id] = m.nama })
    setMandorMap(mMap)

    setLoading(false)
  }

  const grouped = useMemo(() => {
    const groups = {}
    data.forEach(d => {
      const atasanId = d.absen_karyawan?.atasan_id
      const groupName = atasanId && mandorMap[atasanId] ? mandorMap[atasanId] : 'Harian Kantor'
      if (!groups[groupName]) groups[groupName] = []
      groups[groupName].push(d)
    })
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === 'Harian Kantor') return 1
      if (b === 'Harian Kantor') return -1
      return a.localeCompare(b)
    })
  }, [data, mandorMap])

  const draftIds = useMemo(() => data.filter(d => d.status === 'draft').map(d => d.id), [data])
  const isClosed = periode?.status === 'tutup'
  const isHrd = profile?.role === 'hrd' || profile?.role === 'admin'
  const canApprove = isHrd && !isClosed

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === draftIds.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(draftIds))
    }
  }

  async function approveSelected() {
    if (selected.size === 0) return
    const ids = [...selected]
    setError('')
    const { error } = await supabase
      .from('absen_gaji_bulanan')
      .update({ status: 'approved' })
      .in('id', ids)
    if (error) setError(error.message)
    else load()
  }

  async function approveAll() {
    if (!confirm(`Approve semua ${draftIds.length} data gaji draft?`)) return
    setError('')
    const { error } = await supabase
      .from('absen_gaji_bulanan')
      .update({ status: 'approved' })
      .eq('bulan', bulan)
      .eq('tahun', tahun)
      .eq('status', 'draft')
    if (error) setError(error.message)
    else load()
  }

  async function hitungGaji() {
    const activeProj = getActiveProject()
    const activeKode = activeProj?.kode || '524006'

    setCalculating(true)
    setError('')

    const { data: kList } = await supabase.from('absen_karyawan').select('id').eq('kode_proyek', activeKode).eq('status_aktif', true)
    if (!kList || kList.length === 0) {
      setError(`Proyek ${activeProj?.nama_singkat || activeKode} (Kode: ${activeKode}) belum memiliki karyawan terdaftar. Silakan tambahkan karyawan pada menu Master Karyawan terlebih dahulu.`)
      setCalculating(false)
      return
    }

    const { error } = await supabase.rpc('absen_hitung_gaji', { p_bulan: bulan, p_tahun: tahun, p_kode_proyek: activeKode })
    if (error) {
      const { error: fallbackErr } = await supabase.rpc('absen_hitung_gaji', { p_bulan: bulan, p_tahun: tahun })
      if (fallbackErr) setError(fallbackErr.message)
    }
    setCalculating(false)
    load()
  }

  async function tutupPeriode() {
    if (!confirm(`Tutup periode ${namaBulan[bulan]} ${tahun}? Data tidak bisa diubah setelah ditutup.`)) return
    setError('')
    const { error } = await supabase.rpc('absen_tutup_periode', { p_bulan: bulan, p_tahun: tahun })
    if (error) setError(error.message)
    else load()
  }

  async function bukaPeriode() {
    const alasan = prompt('Alasan pembukaan periode:')
    if (!alasan) return
    setError('')
    const { error } = await supabase.rpc('absen_buka_periode', { p_bulan: bulan, p_tahun: tahun, p_alasan: alasan })
    if (error) setError(error.message)
    else load()
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const mx = 14

    // --- Header ---
    doc.setFillColor(26, 35, 50)
    doc.rect(0, 0, pageW, 28, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(255, 255, 255)
    doc.text('REKAP GAJI BULANAN', mx, 13)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(148, 163, 184)
    doc.text(`Periode: ${namaBulan[bulan]} ${tahun}  |  ${data.length} Karyawan`, mx, 22)

    doc.setFontSize(9)
    doc.setTextColor(148, 163, 184)
    const dateStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    doc.text(`Dicetak: ${dateStr}`, pageW - mx, 22, { align: 'right' })

    let startY = 34
    const fmtRp = n => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n || 0))

    const headStyles = {
      fillColor: [241, 245, 249],
      textColor: [71, 85, 105],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
      lineWidth: 0.1,
      lineColor: [226, 232, 240],
    }

    const bodyStyles = {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
      lineWidth: 0.1,
      lineColor: [241, 245, 249],
    }

    const columns = [
      { header: 'No', dataKey: 'no' },
      { header: 'Nama Karyawan', dataKey: 'nama' },
      { header: 'Jabatan', dataKey: 'jabatan' },
      { header: 'Hari\nKerja', dataKey: 'hari' },
      { header: 'Jam\nLembur', dataKey: 'lembur' },
      { header: 'Gaji Pokok', dataKey: 'pokok' },
      { header: 'Gaji Lembur', dataKey: 'gaji_lembur' },
      { header: 'Tunjangan', dataKey: 'tunjangan' },
      { header: 'Total Gaji', dataKey: 'total' },
      { header: 'Status', dataKey: 'status' },
    ]

    const colStyles = {
      no: { cellWidth: 10, halign: 'center' },
      nama: { cellWidth: 'auto' },
      jabatan: { cellWidth: 22 },
      hari: { cellWidth: 14, halign: 'center' },
      lembur: { cellWidth: 16, halign: 'center' },
      pokok: { cellWidth: 30, halign: 'right' },
      gaji_lembur: { cellWidth: 28, halign: 'right' },
      tunjangan: { cellWidth: 26, halign: 'right' },
      total: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      status: { cellWidth: 18, halign: 'center' },
    }

    grouped.forEach(([groupName, items]) => {
      const subPokok = items.reduce((s, d) => s + Number(d.gaji_pokok), 0)
      const subLembur = items.reduce((s, d) => s + Number(d.gaji_lembur), 0)
      const subTunjangan = items.reduce((s, d) => s + Number(d.tunjangan), 0)
      const subTotal = items.reduce((s, d) => s + Number(d.total_gaji), 0)
      const subHari = items.reduce((s, d) => s + d.hari_kerja, 0)
      const subJamLembur = items.reduce((s, d) => s + Number(d.jam_lembur_total), 0)

      const rows = items.map((d, i) => ({
        no: i + 1,
        nama: d.absen_karyawan?.nama || '',
        jabatan: d.absen_karyawan?.jabatan || '',
        hari: d.hari_kerja,
        lembur: `${d.jam_lembur_total}j`,
        pokok: fmtRp(d.gaji_pokok),
        gaji_lembur: fmtRp(d.gaji_lembur),
        tunjangan: fmtRp(d.tunjangan),
        total: fmtRp(d.total_gaji),
        status: d.status,
      }))

      // Check if group header fits on current page
      if (startY > pageH - 30) {
        doc.addPage()
        startY = 14
      }

      // Group header
      doc.setFillColor(59, 130, 246)
      doc.roundedRect(mx, startY, pageW - mx * 2, 7, 1, 1, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.setTextColor(255, 255, 255)
      doc.text(`${groupName}`, mx + 4, startY + 4.8)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.text(`${items.length} karyawan`, pageW - mx - 4, startY + 4.8, { align: 'right' })
      startY += 9

      autoTable(doc, {
        startY,
        columns,
        body: rows,
        headStyles,
        bodyStyles,
        columnStyles: colStyles,
        margin: { left: mx, right: mx },
        tableLineColor: [226, 232, 240],
        tableLineWidth: 0.1,
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell(data) {
          if (data.section === 'body' && data.column.dataKey === 'status') {
            if (data.cell.raw === 'approved') {
              data.cell.styles.textColor = [5, 150, 105]
              data.cell.styles.fontStyle = 'bold'
            } else if (data.cell.raw === 'final') {
              data.cell.styles.textColor = [37, 99, 235]
              data.cell.styles.fontStyle = 'bold'
            } else {
              data.cell.styles.textColor = [217, 119, 6]
            }
          }
        },
      })

      startY = doc.lastAutoTable.finalY

      // Subtotal row
      doc.setFillColor(241, 245, 249)
      doc.rect(mx, startY, pageW - mx * 2, 7, 'F')
      doc.setDrawColor(226, 232, 240)
      doc.rect(mx, startY, pageW - mx * 2, 7, 'S')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(71, 85, 105)
      doc.text('Subtotal', mx + 4, startY + 4.8)

      const tblW = pageW - mx * 2
      doc.text(String(subHari), mx + tblW * 0.34, startY + 4.8, { align: 'center' })
      doc.text(`${subJamLembur.toFixed(1)}j`, mx + tblW * 0.40, startY + 4.8, { align: 'center' })
      doc.setTextColor(30, 41, 59)
      doc.text(fmtRp(subPokok), mx + tblW * 0.54, startY + 4.8, { align: 'right' })
      doc.text(fmtRp(subLembur), mx + tblW * 0.64, startY + 4.8, { align: 'right' })
      doc.text(fmtRp(subTunjangan), mx + tblW * 0.73, startY + 4.8, { align: 'right' })
      doc.setFont('helvetica', 'bold')
      doc.text(fmtRp(subTotal), mx + tblW * 0.85, startY + 4.8, { align: 'right' })

      startY += 12
    })

    // --- Grand Total ---
    if (startY > pageH - 20) {
      doc.addPage()
      startY = 14
    }

    const grandHari = data.reduce((s, d) => s + d.hari_kerja, 0)
    const grandLembur = data.reduce((s, d) => s + Number(d.jam_lembur_total), 0)
    const grandPokok = data.reduce((s, d) => s + Number(d.gaji_pokok), 0)
    const grandGajiLembur = data.reduce((s, d) => s + Number(d.gaji_lembur), 0)
    const grandTunjangan = data.reduce((s, d) => s + Number(d.tunjangan), 0)
    const grandTotal = data.reduce((s, d) => s + Number(d.total_gaji), 0)

    doc.setFillColor(26, 35, 50)
    doc.roundedRect(mx, startY, pageW - mx * 2, 10, 1.5, 1.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(255, 255, 255)
    doc.text(`GRAND TOTAL  (${data.length} Karyawan)`, mx + 5, startY + 6.5)
    doc.setFontSize(8)
    const tblW = pageW - mx * 2
    doc.text(`${grandHari} hari`, mx + tblW * 0.37, startY + 6.5, { align: 'center' })
    doc.text(`${grandLembur.toFixed(1)}j`, mx + tblW * 0.43, startY + 6.5, { align: 'center' })
    doc.setTextColor(147, 197, 253)
    doc.text(fmtRp(grandPokok), mx + tblW * 0.54, startY + 6.5, { align: 'right' })
    doc.text(fmtRp(grandGajiLembur), mx + tblW * 0.64, startY + 6.5, { align: 'right' })
    doc.text(fmtRp(grandTunjangan), mx + tblW * 0.73, startY + 6.5, { align: 'right' })
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text(fmtRp(grandTotal), mx + tblW * 0.85, startY + 6.8, { align: 'right' })

    // --- Footer on every page ---
    const totalPages = doc.internal.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setTextColor(148, 163, 184)
      doc.setFont('helvetica', 'normal')
      doc.text('SI Wajah — Sistem Informasi Web Absensi dan Aktifitas Harian', mx, pageH - 6)
      doc.text(`Halaman ${i} dari ${totalPages}`, pageW - mx, pageH - 6, { align: 'right' })
      doc.setDrawColor(226, 232, 240)
      doc.line(mx, pageH - 10, pageW - mx, pageH - 10)
    }

    doc.save(`Rekap_Gaji_${namaBulan[bulan]}_${tahun}.pdf`)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rekap Bulanan</h1>
          <p className="text-gray-500 text-xs mt-0.5">Perhitungan gaji bulanan karyawan</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canApprove && (
            <>
              <button onClick={hitungGaji} disabled={calculating} className="btn-primary">
                <Calculator size={14} /> {calculating ? 'Menghitung...' : 'Hitung Gaji'}
              </button>
              {selected.size > 0 && (
                <button onClick={approveSelected} className="btn-success">
                  <CheckCircle size={14} /> Approve ({selected.size})
                </button>
              )}
              {selected.size === 0 && draftIds.length > 0 && (
                <button onClick={approveAll} className="btn-success">
                  <CheckCircle size={14} /> Approve Semua ({draftIds.length})
                </button>
              )}
              <button onClick={tutupPeriode} className="btn-success !bg-slate-600 hover:!bg-slate-700">
                <Lock size={14} /> Tutup Periode
              </button>
              <div className="w-px h-6 bg-white/15 hidden sm:block" />
            </>
          )}
          <select value={bulan} onChange={e => setBulan(+e.target.value)} className="select-field text-sm py-1.5">
            {namaBulan.slice(1).map((n, i) => <option key={i+1} value={i+1}>{n}</option>)}
          </select>
          <select value={tahun} onChange={e => setTahun(+e.target.value)} className="select-field text-sm py-1.5">
            {Array.from({ length: new Date().getFullYear() - 2024 + 3 }, (_, i) => 2024 + i).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="main-content">
      {error && (
        <div className="bg-red-50 border border-red-200/80 text-red-700 rounded-xl p-4 mb-6 text-sm flex items-start gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
          {error}
        </div>
      )}

      {isClosed && (
        <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-4 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-emerald-700">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Lock size={16} />
            </div>
            <span className="font-medium">Periode {namaBulan[bulan]} {tahun} sudah ditutup</span>
          </div>
          {profile?.role === 'admin' && (
            <button onClick={bukaPeriode} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors">
              <Unlock size={13} /> Buka Kunci
            </button>
          )}
        </div>
      )}

      <div className="card">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <FileSpreadsheet size={16} className="text-blue-600" />
            </div>
            <div>
              <span className="font-semibold text-gray-900 text-sm">{namaBulan[bulan]} {tahun}</span>
              {data.length > 0 && <span className="text-xs text-gray-400 ml-2">{data.length} karyawan</span>}
            </div>
          </div>
          {data.length > 0 && (
            <button onClick={exportPdf} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors">
              <Download size={13} /> Ekspor PDF
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="table-header">
                <tr>
                  {canApprove && draftIds.length > 0 && (
                    <th className="px-3 py-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selected.size === draftIds.length && draftIds.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title="Pilih semua draft"
                      />
                    </th>
                  )}
                  <th className="text-left px-5 py-3 min-w-[180px]">Nama</th>
                  <th className="text-center px-3 py-3 whitespace-nowrap">Hari Kerja</th>
                  <th className="text-center px-3 py-3 whitespace-nowrap">Jam Lembur</th>
                  <th className="text-right px-3 py-3 whitespace-nowrap">Gaji Pokok</th>
                  <th className="text-right px-3 py-3 whitespace-nowrap">Gaji Lembur</th>
                  <th className="text-right px-3 py-3">Tunjangan</th>
                  <th className="text-right px-3 py-3 whitespace-nowrap text-rose-600 font-bold">Potongan</th>
                  <th className="text-right px-3 py-3 whitespace-nowrap">Total Gaji</th>
                  <th className="text-center px-3 py-3">Status</th>
                  <th className="text-center px-3 py-3 whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grouped.length > 0 ? grouped.map(([groupName, items]) => {
                  const subHari = items.reduce((s, d) => s + d.hari_kerja, 0)
                  const subLembur = items.reduce((s, d) => s + Number(d.jam_lembur_total), 0)
                  const subPokok = items.reduce((s, d) => s + Number(d.gaji_pokok), 0)
                  const subGajiLembur = items.reduce((s, d) => s + Number(d.gaji_lembur), 0)
                  const subTunjangan = items.reduce((s, d) => s + Number(d.tunjangan), 0)
                  const subPotongan = items.reduce((s, d) => s + Number(d.potongan || 0), 0)
                  const subTotal = items.reduce((s, d) => s + Number(d.total_gaji), 0)
                  const colCount = canApprove && draftIds.length > 0 ? 11 : 10

                  return (
                    <Fragment key={groupName}>
                      <tr className="table-group-header">
                        <td colSpan={colCount} className="px-5 py-2">
                          <div className="flex items-center gap-2">
                            <Users size={14} className="text-slate-500" />
                            <span className="font-semibold text-slate-700 text-[13px]">{groupName}</span>
                            <span className="text-[11px] text-slate-400 font-medium">{items.length} karyawan</span>
                          </div>
                        </td>
                      </tr>
                      {items.map(d => (
                        <tr key={d.id} className={`hover:bg-gray-50/50 transition-colors ${selected.has(d.id) ? 'bg-blue-50/40' : ''}`}>
                          {canApprove && draftIds.length > 0 && (
                            <td className="px-3 py-2.5 text-center">
                              {d.status === 'draft' ? (
                                <input
                                  type="checkbox"
                                  checked={selected.has(d.id)}
                                  onChange={() => toggleSelect(d.id)}
                                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                              ) : null}
                            </td>
                          )}
                          <td className="px-5 py-2.5 pl-9">
                            <div className="font-medium text-gray-900 leading-tight">{d.absen_karyawan?.nama}</div>
                            <div className="text-[11px] text-gray-400 leading-tight mt-0.5">
                              {d.absen_karyawan?.jabatan}
                              {d.is_gaji_full && <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-semibold text-[10px]">Full</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums text-gray-700 font-medium">
                            {Number(d.hari_kerja || 0) % 1 === 0 ? Number(d.hari_kerja || 0) : Number(d.hari_kerja || 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums text-gray-500">{d.jam_lembur_total}j</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-900 whitespace-nowrap">Rp {fmt(d.gaji_pokok)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 whitespace-nowrap">Rp {fmt(d.gaji_lembur)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 whitespace-nowrap">Rp {fmt(d.tunjangan)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-rose-600 font-medium whitespace-nowrap">{d.potongan > 0 ? `-Rp ${fmt(d.potongan)}` : '-'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-gray-900 whitespace-nowrap">Rp {fmt(d.total_gaji)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              d.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                              d.status === 'final' ? 'bg-blue-100 text-blue-700' :
                              'bg-amber-50 text-amber-600'
                            }`}>
                              {d.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => openDetailModal(d)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-all text-xs font-semibold"
                              title="Lihat Detail Rincian Gaji Transparan"
                            >
                              <Eye size={13} />
                              <span>Detail</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className="table-group-subtotal">
                        {canApprove && draftIds.length > 0 && <td />}
                        <td className="px-5 py-2 text-[12px] font-semibold text-slate-500 pl-9">Subtotal</td>
                        <td className="px-3 py-2 text-center tabular-nums text-[12px] font-semibold text-slate-600">{subHari}</td>
                        <td className="px-3 py-2 text-center tabular-nums text-[12px] font-semibold text-slate-500">{subLembur.toFixed(1)}j</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[12px] font-semibold text-slate-600 whitespace-nowrap">Rp {fmt(subPokok)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[12px] font-semibold text-slate-500 whitespace-nowrap">Rp {fmt(subGajiLembur)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[12px] font-semibold text-slate-500 whitespace-nowrap">Rp {fmt(subTunjangan)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[12px] font-semibold text-rose-600 whitespace-nowrap">{subPotongan > 0 ? `-Rp ${fmt(subPotongan)}` : '-'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-[12px] font-bold text-slate-700 whitespace-nowrap">Rp {fmt(subTotal)}</td>
                        <td />
                        <td />
                      </tr>
                    </Fragment>
                  )
                }) : (
                  <tr><td colSpan={canApprove && draftIds.length > 0 ? 11 : 10} className="px-5 py-12 text-center text-gray-400">
                    <FileSpreadsheet size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="font-semibold text-gray-600 mb-1">Belum ada data gaji untuk {getActiveProject()?.nama_singkat || 'Proyek Ini'}</p>
                    <p className="text-xs text-gray-400">Klik tombol <strong className="text-blue-600">"Hitung Gaji"</strong> di kanan atas untuk menghitung dan menampilkan gaji karyawan secara otomatis.</p>
                  </td></tr>
                )}
              </tbody>
              {data.length > 0 && (
                <tfoot>
                  <tr className="font-semibold text-gray-900">
                    {canApprove && draftIds.length > 0 && <td />}
                    <td className="px-5 py-3 text-sm">Grand Total ({data.length})</td>
                    <td className="px-3 py-3 text-center tabular-nums">{data.reduce((s,d) => s + d.hari_kerja, 0)}</td>
                    <td className="px-3 py-3 text-center tabular-nums">{data.reduce((s,d) => s + Number(d.jam_lembur_total), 0).toFixed(1)}j</td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">Rp {fmt(data.reduce((s,d) => s + Number(d.gaji_pokok), 0))}</td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">Rp {fmt(data.reduce((s,d) => s + Number(d.gaji_lembur), 0))}</td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">Rp {fmt(data.reduce((s,d) => s + Number(d.tunjangan), 0))}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-rose-600 whitespace-nowrap">{data.reduce((s,d) => s + Number(d.potongan || 0), 0) > 0 ? `-Rp ${fmt(data.reduce((s,d) => s + Number(d.potongan || 0), 0))}` : '-'}</td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">Rp {fmt(data.reduce((s,d) => s + Number(d.total_gaji), 0))}</td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
      </div>

      {/* Modal Detail Perhitungan Gaji Transparan */}
      {detailModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/60 rounded-3xl p-6 max-w-3xl w-full shadow-2xl space-y-5 text-slate-100 max-h-[90vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
                  <Calculator size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Rincian Transparan Perhitungan Gaji</h3>
                  <p className="text-xs text-slate-400">
                    {detailModalItem.absen_karyawan?.nama} — Periode {namaBulan[bulan]} {tahun}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDetailModalItem(null)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Banner Karyawan */}
            {(() => {
              const daysInMonth = new Date(tahun, bulan, 0).getDate()
              const rawMasterGaji = Number(detailModalItem.absen_karyawan?.gaji_bulanan || 0)
              const gajiMasterVal = rawMasterGaji > 0
                ? rawMasterGaji
                : (detailModalItem.is_gaji_full
                    ? Number(detailModalItem.gaji_pokok || 0)
                    : Math.round((Number(detailModalItem.gaji_pokok || 0) / (detailModalItem.hari_kerja || 1)) * daysInMonth))

              return (
                <>
                  <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/50 flex flex-wrap items-center justify-between gap-4 text-xs">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Identitas Pekerja</span>
                      <div className="text-sm font-bold text-slate-100">{detailModalItem.absen_karyawan?.nama}</div>
                      <div className="text-slate-400">{detailModalItem.absen_karyawan?.jabatan || 'Pekerja'}</div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Gaji Master & Tunjangan</span>
                      <div className="text-sm font-bold text-cyan-400">Rp {fmt(gajiMasterVal)} / Bulan</div>
                      <div className="text-slate-400">Tunjangan: Rp {fmt(detailModalItem.absen_karyawan?.tunjangan || detailModalItem.tunjangan || 0)}</div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Status Kehadiran</span>
                      <div>
                        {detailModalItem.is_gaji_full ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold text-xs">
                            <CheckCircle size={13} /> Full Attendance (100% Gaji Penuh)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold text-xs">
                            <Info size={13} /> Pro-Rata Kehadiran ({Number(detailModalItem.hari_kerja || 0) % 1 === 0 ? Number(detailModalItem.hari_kerja || 0) : Number(detailModalItem.hari_kerja || 0).toFixed(2)} / {daysInMonth} Hari)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Grid 4 Kartu Komponen Gaji Transparan */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
                    
                    {/* Kartu 1: Gaji Pokok */}
                    <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-300 text-xs flex items-center gap-1.5">
                          <DollarSign size={14} className="text-cyan-400" /> 1. Gaji Pokok
                        </span>
                        <span className="font-bold text-cyan-400 text-sm">Rp {fmt(detailModalItem.gaji_pokok)}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 space-y-1 font-mono">
                        {detailModalItem.is_gaji_full ? (
                          <div className="text-emerald-300 flex items-center gap-1 font-sans">
                            <CheckCircle size={13} className="shrink-0 text-emerald-400" />
                            <span>Masuk di seluruh hari kerja bulan ini &rarr; Mendapatkan 100% Gaji Bulanan Penuh (Rp {fmt(gajiMasterVal)})</span>
                          </div>
                        ) : (
                          <>
                            <div className="text-slate-400">Rumus Pro-Rata Harian (6 Slot Presensi):</div>
                            <div className="text-amber-300">(Gaji Master ÷ Total Hari Kalender) × Hari Kerja Efektif</div>
                            <div className="text-slate-300">
                              (Rp {fmt(gajiMasterVal)} ÷ {daysInMonth} Hari) × {Number(detailModalItem.hari_kerja || 0) % 1 === 0 ? Number(detailModalItem.hari_kerja || 0) : Number(detailModalItem.hari_kerja || 0).toFixed(2)} Hari Kerja = Rp {fmt(detailModalItem.gaji_pokok)}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Kartu 2: Gaji Lembur */}
                    <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-300 text-xs flex items-center gap-1.5">
                          <Clock size={14} className="text-amber-400" /> 2. Gaji Lembur
                        </span>
                        <span className="font-bold text-amber-400 text-sm">Rp {fmt(detailModalItem.gaji_lembur)}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 space-y-1 font-mono">
                        <div>Total Jam Lembur Approved: <strong className="text-slate-200">{detailModalItem.jam_lembur_total || 0} Jam</strong></div>
                        {Number(detailModalItem.jam_lembur_total) > 0 ? (
                          <>
                            <div className="text-slate-300">Tarif Per Jam = Gaji Master ÷ 26 ÷ 8 Jam = Rp {fmt(gajiMasterVal / 208)}</div>
                            <div className="text-amber-300">Rumus Lembur Flat: Total Jam Lembur × Tarif Per Jam</div>
                            <div className="text-amber-400 font-bold">{detailModalItem.jam_lembur_total} Jam × Rp {fmt(gajiMasterVal / 208)} = Rp {fmt(detailModalItem.gaji_lembur)}</div>
                          </>
                        ) : (
                          <div className="text-slate-500">Tidak ada akumulasi jam lembur pada bulan ini</div>
                        )}
                      </div>
                    </div>

                    {/* Kartu 3: Tunjangan & Potongan */}
                    <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-300 text-xs flex items-center gap-1.5">
                          <Building2 size={14} className="text-purple-400" /> 3. Tunjangan & Potongan (Denda)
                        </span>
                        <span className="font-bold text-purple-400 text-sm">Rp {fmt(Number(detailModalItem.tunjangan || 0) - Number(detailModalItem.potongan || 0))}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 space-y-1.5 font-mono">
                        <div className="flex justify-between items-center">
                          <span>+ Tunjangan Jabatan:</span>
                          <span className="text-slate-200 font-semibold">Rp {fmt(detailModalItem.tunjangan)}</span>
                        </div>
                        <div className="flex justify-between items-center text-rose-400 pt-1 border-t border-slate-800/60">
                          <span>- Potongan / Denda:</span>
                          <span className="font-bold">Rp {fmt(detailModalItem.potongan || 0)}</span>
                        </div>
                      </div>

                      {/* Interactive Denda / Potongan Input */}
                      {!isClosed && (
                        <div className="pt-2 border-t border-slate-800/80 space-y-2">
                          <label className="text-[11px] font-bold text-rose-300 flex items-center gap-1">
                            Input / Update Nominal Denda & Potongan Gaji (Rp):
                          </label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rp</span>
                              <input
                                type="number"
                                value={potonganInput}
                                onChange={e => setPotonganInput(e.target.value)}
                                placeholder="0"
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-rose-500"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => savePotongan(detailModalItem)}
                              disabled={savingPotongan}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-colors whitespace-nowrap"
                            >
                              {savingPotongan ? 'Simpan...' : 'Simpan Denda'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Kartu 4: Take Home Pay */}
                    <div className="bg-slate-950/90 p-4 rounded-2xl border border-emerald-500/40 space-y-2 bg-gradient-to-br from-emerald-950/30 to-slate-950">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-400 text-xs uppercase tracking-wider">4. Total Gaji (Take Home Pay)</span>
                        <span className="font-extrabold text-emerald-400 text-base">Rp {fmt(detailModalItem.total_gaji)}</span>
                      </div>
                      <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-900/90 p-2.5 rounded-xl border border-emerald-500/20 space-y-1 font-mono">
                        <div>= Gaji Pokok + Gaji Lembur + Tunjangan - Potongan</div>
                        <div className="text-emerald-400 font-bold">
                          = Rp {fmt(detailModalItem.gaji_pokok)} + Rp {fmt(detailModalItem.gaji_lembur)} + Rp {fmt(detailModalItem.tunjangan)} - Rp {fmt(detailModalItem.potongan || 0)}
                        </div>
                      </div>
                    </div>

                  </div>
                </>
              )
            })()}

            {/* Tabel Break-down Presensi Harian */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-400" /> Log Presensi Harian ({namaBulan[bulan]} {tahun})
                </h4>
                <span className="text-[11px] text-slate-400 font-semibold">Total {detailHarian.length} Catatan Absen</span>
              </div>

              {loadingDetail ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                </div>
              ) : detailHarian.length === 0 ? (
                <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 text-center text-xs text-slate-500">
                  Tidak ada rincian presensi harian yang tercatat pada bulan ini.
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-800 overflow-hidden text-xs max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold sticky top-0">
                      <tr>
                        <th className="px-3.5 py-2.5">Tanggal</th>
                        <th className="px-3.5 py-2.5 text-center">Slot Disetujui</th>
                        <th className="px-3.5 py-2.5 text-center">Bobot Gaji Harian</th>
                        <th className="px-3.5 py-2.5">Jam Scan</th>
                        <th className="px-3.5 py-2.5 text-center">Status Approval & Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/40 text-slate-300 text-[11px]">
                      {detailHarian.map(h => {
                        const dObj = new Date(h.tanggal)
                        const tglFmt = !isNaN(dObj.getTime())
                          ? dObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
                          : h.tanggal

                        const verifiedCount = typeof h.verifiedSlots === 'number' ? h.verifiedSlots : (h.status === 'LENGKAP' ? 6 : (h.jam_masuk ? 1 : 0))
                        const pct = Math.round((verifiedCount / 6.0) * 100)
                        const bobotVal = (verifiedCount / 6.0).toFixed(2)

                        return (
                          <tr key={h.id || h.tanggal} className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-3.5 py-2.5 font-mono font-medium text-slate-200">{tglFmt}</td>
                            <td className="px-3.5 py-2.5 text-center font-mono font-bold text-cyan-300">
                              {verifiedCount} / 6 Slot
                            </td>
                            <td className="px-3.5 py-2.5 text-center font-mono font-bold text-emerald-400">
                              {pct}% ({bobotVal} Hari)
                            </td>
                            <td className="px-3.5 py-2.5 font-mono text-slate-300">
                              <span className="text-cyan-400">{h.jam_masuk ? h.jam_masuk.slice(0,5) : '-'}</span>
                              <span className="text-slate-500 mx-1">s/d</span>
                              <span className="text-indigo-400">{h.jam_pulang ? h.jam_pulang.slice(0,5) : '-'}</span>
                            </td>
                            <td className="px-3.5 py-2.5 text-center">
                              {h.pendingCount > 0 ? (
                                <span className="px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                                  <Info size={11} /> {verifiedCount}/6 Disetujui ({h.pendingCount} Menunggu Approval Admin)
                                </span>
                              ) : verifiedCount >= 6 ? (
                                <span className="px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1">
                                  <CheckCircle size={11} /> 100% Lengkap (6/6 Disetujui)
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 inline-flex items-center gap-1">
                                  {verifiedCount}/6 Disetujui ({6 - verifiedCount} Terlewat)
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setDetailModalItem(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors"
              >
                Tutup
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
