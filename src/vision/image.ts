// Small image helpers shared by the capture worker, the analysis and tests.

/** Box-average downsample by an integer factor. dst must hold dstW·dstH. */
export function boxDownsample(
  src: Uint8Array,
  srcWidth: number,
  factor: number,
  dst: Uint8Array,
  dstWidth: number,
  dstHeight: number,
): void {
  if (factor === 1) {
    for (let y = 0; y < dstHeight; y++) {
      dst.set(
        src.subarray(y * srcWidth, y * srcWidth + dstWidth),
        y * dstWidth,
      );
    }
    return;
  }
  const area = factor * factor;
  for (let y = 0; y < dstHeight; y++) {
    const sy = y * factor;
    for (let x = 0; x < dstWidth; x++) {
      const sx = x * factor;
      let sum = 0;
      for (let dy = 0; dy < factor; dy++) {
        let idx = (sy + dy) * srcWidth + sx;
        for (let dx = 0; dx < factor; dx++) sum += src[idx++];
      }
      dst[y * dstWidth + x] = (sum / area + 0.5) | 0;
    }
  }
}

/** Bilinear sample; returns NaN outside the image. */
export function sampleBilinear(
  img: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return NaN;
  const x0 = Math.min(Math.floor(x), width - 2);
  const y0 = Math.min(Math.floor(y), height - 2);
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * width + x0;
  const top = img[i] * (1 - fx) + img[i + 1] * fx;
  const bottom = img[i + width] * (1 - fx) + img[i + width + 1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/** Otsu's threshold over a 256-bin histogram. */
export function otsuThreshold(histogram: Uint32Array): number {
  let total = 0;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) {
    total += histogram[i];
    sumAll += i * histogram[i];
  }
  let weightBg = 0;
  let sumBg = 0;
  let best = 0;
  let bestVariance = -1;
  for (let t = 0; t < 256; t++) {
    weightBg += histogram[t];
    if (weightBg === 0) continue;
    const weightFg = total - weightBg;
    if (weightFg === 0) break;
    sumBg += t * histogram[t];
    const meanBg = sumBg / weightBg;
    const meanFg = (sumAll - sumBg) / weightFg;
    const between = weightBg * weightFg * (meanBg - meanFg) ** 2;
    if (between > bestVariance) {
      bestVariance = between;
      best = t;
    }
  }
  return best;
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
