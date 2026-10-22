/** Recorte quadrado em pixels da imagem original. */
export interface SquareCrop {
  x: number
  y: number
  side: number
}

/**
 * Reduz a foto para um quadrado de `size` px em JPEG: o recorte escolhido ou, sem ele, o centro.
 * Redesenhar no canvas também descarta os metadados (EXIF/GPS) da foto original.
 */
export async function squareThumbnail(file: File, size = 400, quality = 0.85, crop?: SquareCrop): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('not_an_image')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const side = Math.min(bitmap.width, bitmap.height)
  const area = crop ?? { x: (bitmap.width - side) / 2, y: (bitmap.height - side) / 2, side }
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, area.x, area.y, area.side, area.side, 0, 0, size, size)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))), 'image/jpeg', quality),
  )
}
