/**
 * Utility Geofencing & Anti-Fake GPS Security Engine
 */

export function getDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return 0
  const nLat1 = Number(lat1)
  const nLon1 = Number(lon1)
  const nLat2 = Number(lat2)
  const nLon2 = Number(lon2)
  if (isNaN(nLat1) || isNaN(nLon1) || isNaN(nLat2) || isNaN(nLon2)) return 0

  const R = 6371000 // Jari-jari bumi dalam meter
  const dLat = (nLat2 - nLat1) * (Math.PI / 180)
  const dLon = (nLon2 - nLon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(nLat1 * (Math.PI / 180)) *
      Math.cos(nLat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

export function formatDistance(meters) {
  if (!meters || meters <= 0) return '0 m'
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }
  return `${meters} m`
}

/**
 * Evaluasi pintar apakah koordinat scan berada di luar geofence site.
 * Mengintegrasikan toleransi margin error akurasi hardware GPS (device accuracy drift).
 * 
 * @param {number} userLat Latitude presensi pekerja
 * @param {number} userLng Longitude presensi pekerja
 * @param {number} siteLat Latitude pusat site proyek
 * @param {number} siteLng Longitude pusat site proyek
 * @param {number} radiusMeter Radius geofence site proyek (default 1000m)
 * @param {number} [gpsAccuracyMeter=0] Akurasi hardware GPS dari HP pekerja (pos.coords.accuracy)
 * @returns {{ isOutside: boolean, distanceMeters: number, effectiveDistanceMeters: number, allowedRadiusMeters: number, accuracyBuffer: number }}
 */
export function isLocationOutsideGeofence(userLat, userLng, siteLat, siteLng, radiusMeter = 1000, gpsAccuracyMeter = 0) {
  const dist = getDistanceMeters(userLat, userLng, siteLat, siteLng)
  const allowedRadius = Number(radiusMeter) || 1000
  
  // GPS hardware accuracy buffer:
  // Jika HP pekerja memiliki toleransi deviasi (misal ±35 meter karena cuaca/atap seng/gedung),
  // buffer ini diperhitungkan secara adil (maksimal 100 meter buffer toleransi hardware)
  const acc = Number(gpsAccuracyMeter) || 0
  const accuracyBuffer = Math.min(Math.max(0, acc), 100)
  
  // Jarak efektif bersih (dikurangi buffer deviasi hardware GPS)
  const effectiveDist = Math.max(0, dist - accuracyBuffer)
  const isOutside = effectiveDist > allowedRadius

  return {
    isOutside,
    distanceMeters: dist,
    effectiveDistanceMeters: effectiveDist,
    allowedRadiusMeters: allowedRadius,
    accuracyBuffer
  }
}

/**
 * Mendeteksi kecurigaan penggunaan Fake GPS / Mock Location berdasarkan analisis sinyal
 * @param {GeolocationPosition} position Objek GeolocationPosition dari navigator.geolocation
 * @returns {{ isMock: boolean, score: number, reasons: string[], accuracy: number, lat: number, lng: number }}
 */
export function analyzeGpsIntegrity(position) {
  if (!position || !position.coords) {
    return { 
      isMock: true, 
      score: 100, 
      reasons: ['Data sinyal GPS tidak terdeteksi'],
      accuracy: 0,
      lat: 0,
      lng: 0
    }
  }

  const coords = position.coords
  const reasons = []
  let riskScore = 0

  const accuracy = coords.accuracy || 0
  const altitude = coords.altitude
  const speed = coords.speed
  const timestamp = position.timestamp

  // 1. Uji Akurasi Sempurna Palsu (Fake GPS Injector biasa menyuntikkan accuracy === 0 atau 1.0 persis)
  if (accuracy <= 1) {
    riskScore += 50
    reasons.push(`Akurasi GPS tidak wajar (persis ${accuracy}m, sinyal buatan Fake GPS)`)
  } else if (accuracy > 1500) {
    riskScore += 30
    reasons.push(`Sinyal GPS terlalu lemah/buruk (${Math.round(accuracy)}m)`)
  }

  // 2. Uji Presisi Desimal Koordinat (Fake GPS biasa menyuntikkan angka desimal pendek/terpotong)
  const latStr = String(coords.latitude)
  const lngStr = String(coords.longitude)
  const latDecimals = latStr.includes('.') ? latStr.split('.')[1].length : 0
  const lngDecimals = lngStr.includes('.') ? lngStr.split('.')[1].length : 0

  if (latDecimals < 4 || lngDecimals < 4) {
    riskScore += 30
    reasons.push('Desimal koordinat terlalu pendek (kemungkinan buatan/manual)')
  }

  // 3. Uji Timestamp Stale (Sinyal GPS kedaluwarsa dari jam sistem)
  if (timestamp) {
    const ageMs = Math.abs(Date.now() - timestamp)
    if (ageMs > 60000) { // Lebih dari 1 menit lalu
      riskScore += 30
      reasons.push(`Waktu sinyal GPS kedaluwarsa (${Math.round(ageMs / 1000)} detik lalu)`)
    }
  }

  // 4. Uji Sensor Perangkat (Altitude & Speed null bersamaan dengan akurasi terlampau tinggi)
  if (altitude === null && speed === null && accuracy < 5) {
    riskScore += 20
    reasons.push('Parameter sinyal satelit tidak wajar (tanpa data altitude/kecepatan)')
  }

  const isMock = riskScore >= 50

  return {
    isMock,
    score: Math.min(100, riskScore),
    reasons,
    accuracy: Math.round(accuracy),
    lat: coords.latitude,
    lng: coords.longitude
  }
}
