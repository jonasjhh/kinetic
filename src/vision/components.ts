// Connected-component labelling (8-connectivity) over a binary mask, with
// the running sums needed for image moments accumulated as each blob is
// flood-filled. Buffers are supplied by the caller and reused across calls
// so the per-frame path allocates no large arrays.

export interface BlobStats {
  count: number;
  sumX: number;
  sumY: number;
  sumXX: number;
  sumYY: number;
  sumXY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  // Pixels of this blob that are also set in the optional `aux` mask.
  auxCount: number;
  // Sum of the optional per-pixel `values` over the blob.
  valueSum: number;
  // Index of the pixel the flood fill started from (any blob pixel).
  start: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number; // inclusive
  y1: number; // inclusive
}

export interface LabelBuffers {
  visited: Uint8Array;
  stack: Int32Array;
}

export function createLabelBuffers(pixelCount: number): LabelBuffers {
  return {
    visited: new Uint8Array(pixelCount),
    stack: new Int32Array(pixelCount),
  };
}

export function findBlobs(
  mask: Uint8Array,
  width: number,
  height: number,
  buffers: LabelBuffers,
  options: {
    minPixels: number;
    aux?: Uint8Array;
    values?: Float32Array;
    rect?: Rect;
  },
): BlobStats[] {
  const rect = options.rect ?? {
    x0: 0,
    y0: 0,
    x1: width - 1,
    y1: height - 1,
  };
  const { visited, stack } = buffers;
  const aux = options.aux;
  const values = options.values;

  for (let y = rect.y0; y <= rect.y1; y++) {
    visited.fill(0, y * width + rect.x0, y * width + rect.x1 + 1);
  }

  const blobs: BlobStats[] = [];
  for (let sy = rect.y0; sy <= rect.y1; sy++) {
    for (let sx = rect.x0; sx <= rect.x1; sx++) {
      const start = sy * width + sx;
      if (!mask[start] || visited[start]) continue;

      const blob: BlobStats = {
        count: 0,
        sumX: 0,
        sumY: 0,
        sumXX: 0,
        sumYY: 0,
        sumXY: 0,
        minX: sx,
        maxX: sx,
        minY: sy,
        maxY: sy,
        auxCount: 0,
        valueSum: 0,
        start,
      };
      let top = 0;
      stack[top++] = start;
      visited[start] = 1;

      while (top > 0) {
        const idx = stack[--top];
        const x = idx % width;
        const y = (idx - x) / width;

        blob.count++;
        blob.sumX += x;
        blob.sumY += y;
        blob.sumXX += x * x;
        blob.sumYY += y * y;
        blob.sumXY += x * y;
        if (x < blob.minX) blob.minX = x;
        if (x > blob.maxX) blob.maxX = x;
        if (y < blob.minY) blob.minY = y;
        if (y > blob.maxY) blob.maxY = y;
        if (aux && aux[idx]) blob.auxCount++;
        if (values) blob.valueSum += values[idx];

        const nx0 = x > rect.x0 ? x - 1 : x;
        const nx1 = x < rect.x1 ? x + 1 : x;
        const ny0 = y > rect.y0 ? y - 1 : y;
        const ny1 = y < rect.y1 ? y + 1 : y;
        for (let ny = ny0; ny <= ny1; ny++) {
          const row = ny * width;
          for (let nx = nx0; nx <= nx1; nx++) {
            const n = row + nx;
            if (mask[n] && !visited[n]) {
              visited[n] = 1;
              stack[top++] = n;
            }
          }
        }
      }

      if (blob.count >= options.minPixels) blobs.push(blob);
    }
  }
  return blobs;
}
