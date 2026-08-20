/**
 * Utility untuk Kompresi Foto & Penghematan Ruang Penyimpanan Database & Supabase Storage
 *
 * Mengompresi resolusi gambar (max 800x800px) dan kualitas JPEG (0.7)
 * Mengurangi ukuran file dari ~5MB menjadi ~30KB - 70KB (Penghematan > 95%).
 */

export async function compressImage(source, options = {}) {
  const {
    maxWidth = 800,
    maxHeight = 800,
    quality = 0.7,
    mimeType = 'image/jpeg',
    fileName = `foto_${Date.now()}.jpg`
  } = options

  return new Promise((resolve, reject) => {
    const img = new Image()

    function processImg() {
      try {
        let width = img.width
        let height = img.height

        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          } else {
            width = Math.round((width * maxHeight) / height)
            height = maxHeight
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(new Error('Gagal mengompresi gambar (blob null)'))
              return
            }
            const file = new File([blob], fileName, { type: mimeType })
            const url = URL.createObjectURL(blob)
            resolve({ file, blob, url, width, height, size: blob.size })
          },
          mimeType,
          quality
        )
      } catch (err) {
        reject(err)
      }
    }

    img.onload = processImg
    img.onerror = err => reject(err)

    if (typeof source === 'string') {
      img.src = source
    } else if (source instanceof File || source instanceof Blob) {
      img.src = URL.createObjectURL(source)
    } else {
      reject(new Error('Tipe sumber gambar tidak valid'))
    }
  })
}
