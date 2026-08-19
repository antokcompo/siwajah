import * as faceapi from 'face-api.js'

let modelsLoaded = false

export async function loadModels() {
  if (modelsLoaded) return
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models'),
    faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
  ])
  modelsLoaded = true
}

export async function detectFace(videoEl) {
  const detection = await faceapi
    .detectSingleFace(videoEl, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks(true)
    .withFaceDescriptor()
  return detection || null
}

export function compareFaces(descriptor1, descriptor2) {
  return faceapi.euclideanDistance(descriptor1, descriptor2)
}

export function findBestMatch(queryDescriptor, labeledDescriptors) {
  let bestMatch = null
  let bestDistance = Infinity
  for (const item of labeledDescriptors) {
    const stored = new Float32Array(item.descriptor)
    const distance = faceapi.euclideanDistance(queryDescriptor, stored)
    if (distance < bestDistance) {
      bestDistance = distance
      bestMatch = item
    }
  }
  const threshold = 0.6
  if (bestDistance < threshold) {
    return { match: bestMatch, distance: bestDistance, confidence: 1 - bestDistance }
  }
  return null
}

export function getConfidenceLevel(confidence) {
  if (confidence >= 0.75) return { label: 'Tinggi', color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
  if (confidence >= 0.55) return { label: 'Sedang', color: 'text-amber-400', bg: 'bg-amber-500/10' }
  return { label: 'Rendah', color: 'text-red-400', bg: 'bg-red-500/10' }
}

export { faceapi }
