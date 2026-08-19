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

  for (const scan of pending) {
    try {
      let fotoUrl = null
      if (scan.fotoBlob) {
        const blob = scan.fotoBlob instanceof Blob
          ? scan.fotoBlob
          : new Blob([scan.fotoBlob], { type: 'image/jpeg' })
        const filePath = `${scan.karyawan_id}/${scan.waktu_scan_epoch}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('scan-photos')
          .upload(filePath, blob, { contentType: 'image/jpeg', upsert: false })
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('scan-photos').getPublicUrl(filePath)
          fotoUrl = urlData.publicUrl
        }
      }

      const { data, error } = await supabase.rpc('absen_catat_scan_wajah', {
        p_karyawan_id: scan.karyawan_id,
        p_slot_id: scan.slot_id,
        p_lokasi_kerja: scan.lokasi_kerja || null,
        p_jenis_pekerjaan: scan.jenis_pekerjaan || null,
        p_keterangan: scan.keterangan || null,
        p_foto_url: fotoUrl,
        p_gps_lat: scan.gps_lat || null,
        p_gps_lng: scan.gps_lng || null,
        p_confidence: scan.confidence,
        p_client_tz: scan.client_tz || null,
        p_waktu_scan: scan.waktu_scan,
      })

      if (error) throw error
      if (data?.error && data.error !== 'Sudah absen untuk slot ini hari ini') {
        throw new Error(data.error)
      }

      await removePendingScan(scan.id)
      synced++
    } catch (err) {
      console.warn('Sync failed for scan', scan.id, err)
      failed++
    }
  }

  syncing = false
  notify({ syncing: false, lastResult: { synced, failed, total: pending.length } })
  return { synced, failed }
}

export function startAutoSync() {
  window.addEventListener('online', () => {
    setTimeout(() => syncPendingScans(), 2000)
  })

  if (navigator.onLine) {
    syncPendingScans()
  }
}
