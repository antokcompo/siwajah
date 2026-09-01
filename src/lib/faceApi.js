import * as faceapi from 'face-api.js'

let modelsLoaded = false
let modelsPromise = null

export function withTimeout(promise, ms, errorMessage = 'Waktu operasi habis') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage))
    }, ms)
    promise
      .then(res => { clearTimeout(timer); resolve(res) })
      .catch(err => { clearTimeout(timer); reject(err) })
  })
}

export async function loadModels() {
  if (modelsLoaded) return
  if (modelsPromise) return modelsPromise

  modelsPromise = withTimeout(
    Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
      faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
      faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
    ]),
    12000,
    'Gagal memuat model AI (waktu koneksi habis). Silakan coba lagi.'
  ).then(() => {
    modelsLoaded = true
  }).catch(err => {
    modelsPromise = null
    throw err
  })

  return modelsPromise
}

export async function detectFace(videoEl) {
  if (!modelsLoaded) await loadModels()

  const runDetection = async () => {
    // 1. Primary detection: SsdMobilenetv1 with lowered confidence threshold (0.22)
    try {
      const detection = await faceapi
        .detectSingleFace(videoEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.22 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor()

      if (detection) return detection
    } catch (_e) {}

    // 2. Secondary fallback: TinyFaceDetector with inputSize 512 for extreme pitch angles (Tengadah / Menunduk)
    try {
      const detection = await faceapi
        .detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.18 }))
        .withFaceLandmarks(true)
        .withFaceDescriptor()

      if (detection) return detection
    } catch (_e) {}

    return null
  }

  try {
    return await withTimeout(runDetection(), 15000, 'Deteksi wajah terlalu lama.')
  } catch (err) {
    console.warn('detectFace note:', err.message || err)
    return null
  }
}

export function compareFaces(descriptor1, descriptor2) {
  return faceapi.euclideanDistance(descriptor1, descriptor2)
}

export function findBestMatch(queryDescriptor, labeledDescriptors) {
  let bestMatch = null
  let bestDistance = Infinity

  for (const item of labeledDescriptors) {
    let descList = item.descriptor
    if (!descList || !Array.isArray(descList)) continue

    // Normalize single vector to list of vectors
    if (descList.length > 0 && typeof descList[0] === 'number') {
      descList = [descList]
    }

    for (const d of descList) {
      if (!Array.isArray(d) || d.length !== 128) continue
      const stored = new Float32Array(d)
      const distance = faceapi.euclideanDistance(queryDescriptor, stored)
      if (distance < bestDistance) {
        bestDistance = distance
        bestMatch = item
      }
    }
  }

  const threshold = 0.62 // Optimized threshold for facial hair & multi-angle matching
  if (bestDistance < threshold) {
    const confidence = Math.min(0.99, Math.max(0.40, 1 - (bestDistance / 0.70)))
    return { match: bestMatch, distance: bestDistance, confidence }
  }
  return null
}

export function getConfidenceLevel(confidence) {
  if (confidence >= 0.75) return { label: 'Tinggi', color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
  if (confidence >= 0.55) return { label: 'Sedang', color: 'text-amber-400', bg: 'bg-amber-500/10' }
  return { label: 'Rendah', color: 'text-red-400', bg: 'bg-red-500/10' }
}

export { faceapi }
