/**
 * Reduz a foto para um quadrado de `size` px (recorte central) em JPEG.
 * Redesenhar no canvas também descarta os metadados (EXIF/GPS) da foto original.
 */
export async function squareThumbnail(file: File, size = 320, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('not_an_image')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))), 'image/jpeg', quality),
  )
}
