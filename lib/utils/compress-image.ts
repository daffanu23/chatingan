/**
 * Compresses an image file using Canvas API / createImageBitmap before uploading.
 * Supports HEIC/HEIF (common in iPhone / smartphone photos) via dynamic heic2any conversion.
 * Reduces file size while maintaining acceptable quality.
 * If compression is unsupported or fails for any reason, gracefully falls back to the original file.
 */
export async function compressImage(
  file: File,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
  } = {}
): Promise<File> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.7 } = options

  // Skip SVG or GIF or non-image
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file
  }

  let processableFile = file
  const isHeic =
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif') ||
    file.type.includes('heic') ||
    file.type.includes('heif')

  // Convert HEIC/HEIF to JPEG first so browsers can decode and compress it to WebP
  if (isHeic && typeof window !== 'undefined') {
    try {
      const heic2anyModule = await import('heic2any')
      const heic2any = heic2anyModule.default || heic2anyModule
      const convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.85,
      })
      const singleBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob
      processableFile = new File(
        [singleBlob],
        file.name.replace(/\.[^/.]+$/, '.jpg'),
        {
          type: 'image/jpeg',
          lastModified: Date.now(),
        }
      )
    } catch (err) {
      console.warn('HEIC conversion failed, proceeding with original:', err)
    }
  }

  // 1. Try modern createImageBitmap API first (fastest, lowest memory)
  try {
    if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(processableFile)
      let { width, height } = bitmap

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, width, height)
        bitmap.close()

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), 'image/webp', quality)
        })

        if (blob && (blob.size < file.size || isHeic)) {
          return new File([blob], file.name.replace(/\.[^/.]+$/, '.webp'), {
            type: 'image/webp',
            lastModified: Date.now(),
          })
        }
      }
    }
  } catch (err) {
    console.warn('createImageBitmap compression skipped, trying fallback:', err)
  }

  // 2. Fallback to URL.createObjectURL + HTMLImageElement
  try {
    const objectUrl = URL.createObjectURL(processableFile)
    const result = await new Promise<File>((resolve) => {
      const img = new Image()

      img.onload = () => {
        URL.revokeObjectURL(objectUrl)
        try {
          const canvas = document.createElement('canvas')
          let { width, height } = img

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height)
            width = Math.round(width * ratio)
            height = Math.round(height * ratio)
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            resolve(processableFile)
            return
          }

          ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob(
            (blob) => {
              if (blob && (blob.size < file.size || isHeic)) {
                resolve(
                  new File([blob], file.name.replace(/\.[^/.]+$/, '.webp'), {
                    type: 'image/webp',
                    lastModified: Date.now(),
                  })
                )
              } else {
                resolve(processableFile)
              }
            },
            'image/webp',
            quality
          )
        } catch {
          resolve(processableFile)
        }
      }

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        // Fallback to processableFile
        resolve(processableFile)
      }

      img.src = objectUrl
    })

    return result
  } catch {
    return processableFile
  }
}
