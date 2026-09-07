/**
 * Pixel-level comparison for motion-vs-static claims: decode two PNG
 * captures (8-bit, non-interlaced — what CDP screenshots are) and measure
 * the fraction of pixels whose channels moved. Shared by the runtime lab's
 * acceptance test and the run-mode journey.
 */
import { inflateSync } from 'node:zlib'

export function decodePng(buffer) {
  let offset = 8
  const chunks = []
  let width = 0, height = 0, bitDepth = 0, colorType = 0
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]
      if (bitDepth !== 8 || data[12] !== 0) throw new Error('unsupported PNG layout')
    }
    if (type === 'IDAT') chunks.push(data)
    offset += 12 + length
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  const raw = inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0
      const value = row[x]
      pixels[y * stride + x] = (filter === 0 ? value
        : filter === 1 ? value + left
        : filter === 2 ? value + up
        : filter === 3 ? value + ((left + up) >> 1)
        : value + paeth(left, up, upLeft)) & 0xff
    }
  }
  return { width, height, channels, pixels }
}

/** Fraction of pixels whose max channel delta exceeds `threshold`. */
export function changedFraction(pngA, pngB, threshold = 12) {
  const a = decodePng(Buffer.from(pngA, 'base64'))
  const b = decodePng(Buffer.from(pngB, 'base64'))
  if (a.pixels.length !== b.pixels.length) return 1
  let changed = 0
  const pixelCount = a.pixels.length / a.channels
  for (let i = 0; i < pixelCount; i += 1) {
    let maxDelta = 0
    for (let c = 0; c < a.channels; c += 1) {
      maxDelta = Math.max(maxDelta, Math.abs(a.pixels[i * a.channels + c] - b.pixels[i * a.channels + c]))
    }
    if (maxDelta > threshold) changed += 1
  }
  return changed / pixelCount
}
