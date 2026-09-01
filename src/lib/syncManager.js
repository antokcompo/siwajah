import { supabase } from './supabase'
import { getPendingScans, removePendingScan } from './offlineQueue'

let syncing = false
let listeners = []

export function onSyncChange(fn) {
  listeners.push(fn)
  return () => { listeners = listeners.filter(l => l !== fn) }
}

function notify(status) {
  listeners.forEach(fn => fn(status))
}

export async function syncPendingScans() {
  if (syncing || !navigator.onLine) return { synced: 0, failed: 0 }
  syncing = true
  notify({ syncing: true })

  const pending = await getPendingScans()
  let synced = 0
  let failed = 0
  let lastError = null

  for (const scan of pending) {
    try {
      let fotoUrl = null
      const photoSource = scan.fotoData || scan.fotoBlob
      if (photoSource) {
        const blob = photoSource instanceof Blob
          ? photoSource
          : new Blob([photoSource], { type: 'image/jpeg' })
        const filePath = `${scan.karyawan_id}/${scan.waktu_scan_epoch}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('scan-photos')
          .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true })
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('scan-photos').getPublicUrl(filePath)
          fotoUrl = urlData.publicUrl
        }
      }

      let targetSlotId = scan.slot_id
      if (typeof targetSlotId === 'string' && targetSlotId.includes('dynamic')) {
        try {
          const { data: dbSlot } = await supabase
            .from('absen_jadwal_slot')
            .select('id')
            .or('jenis.eq.pulang_lembur,label.ilike.%pulang lembur%')
            .maybeSingle()
          if (dbSlot?.id) targetSlotId = String(dbSlot.id)
        } catch (e) {}
      }

      let syncSuccess = false
      const { data, error } = await supabase.rpc('absen_catat_scan_wajah', {
        p_karyawan_id: scan.karyawan_id,
        p_slot_id: String(targetSlotId),
        p_lokasi_kerja: scan.lokasi_kerja || null,
        p_jenis_pekerjaan: scan.jenis_pekerjaan || null,
        p_keterangan: scan.keterangan || null,
        p_foto_url: fotoUrl,
        p_gps_lat: scan.gps_lat || null,
        p_gps_lng: scan.gps_lng || null,
        p_confidence: scan.confidence,
        p_client_tz: scan.client_tz || null,
        p_is_mock_gps: scan.is_mock_gps || false,
        p_gps_accuracy: scan.gps_accuracy || null,
        p_fake_gps_score: scan.fake_gps_score || 0,
        p_fake_gps_reason: scan.fake_gps_reason || null,
        p_waktu_scan: scan.waktu_scan || new Date().toISOString(),
      })

      if (!error && (!data?.error || data.error.includes('Sudah absen') || data.error.includes('duplicate'))) {
        syncSuccess = true
      } else if (error) {
        console.warn('Sync RPC failed, using direct table insert fallback:', error)
        const slotNum = Number(targetSlotId)
        const isSlotUuid = typeof targetSlotId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetSlotId)
        const nowIso = scan.waktu_scan || new Date().toISOString()

        const { error: directErr } = await supabase
          .from('absen_scan_wajah')
          .insert({
            karyawan_id: scan.karyawan_id,
            slot_id: isSlotUuid ? targetSlotId : (!isNaN(slotNum) && slotNum > 0 ? slotNum : null),
            tanggal: nowIso.split('T')[0],
            waktu_scan: nowIso,
            lokasi_kerja: scan.lokasi_kerja || null,
            jenis_pekerjaan: scan.jenis_pekerjaan || null,
            keterangan: scan.keterangan || null,
            foto_url: fotoUrl,
            gps_lat: scan.gps_lat || null,
            gps_lng: scan.gps_lng || null,
            confidence: scan.confidence,
            client_tz: scan.client_tz || null,
            is_mock_gps: scan.is_mock_gps || false,
            gps_accuracy: scan.gps_accuracy || null,
            fake_gps_score: scan.fake_gps_score || 0,
            fake_gps_reason: scan.fake_gps_reason || null,
            kode_proyek: '524006'
          })

        if (!directErr || (directErr.message && directErr.message.includes('duplicate'))) {
          syncSuccess = true
        } else {
          throw directErr
        }
      }

      if (syncSuccess) {
        await removePendingScan(scan.id)
        synced++
      }
    } catch (err) {
      console.error('Sync failed for scan', scan.id, err)
      lastError = err.message || String(err)
      failed++
    }
  }

  syncing = false
  notify({ syncing: false, lastResult: { synced, failed, total: pending.length, lastError } })
  return { synced, failed, lastError }
}

export function startAutoSync() {
  window.addEventListener('online', () => {
    setTimeout(() => syncPendingScans(), 2000)
  })

  if (navigator.onLine) {
    syncPendingScans()
  }
}
