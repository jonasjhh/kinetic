import {
  findBlobs,
  type BlobStats,
  type LabelBuffers,
} from "../vision/components";
import { otsuThreshold } from "../vision/image";
import { shapeFromSums, widthAcross, type Shape } from "../vision/shape";

const MIN_THRESHOLD = 14;
const MIN_PIXELS = 20;
const MIN_CIRCLE_POINTS = 12;

export interface DiscMeasurement {
  cx: number;
  cy: number;
  shape: Shape;
  diameter: number; // width across the motion direction (blur-free)
  border: boolean; // disc cut off by the image edge
  circle: { cx: number; cy: number; r: number } | null; // only for border frames
}

export interface MeasureBuffers {
  mask: Uint8Array;
  labels: LabelBuffers;
  histogram: Uint32Array;
}

export interface Seed {
  x: number;
  y: number;
  d: number;
  major: number;
}

// Segments one disc in a full-resolution frame, around a seed position
// from the low-resolution detector. The silhouette is the connected region
// differing from the background; enclosed holes (a light marker against
// light sky can match the background) are filled before measuring. The
// diameter is the silhouette's width perpendicular to the motion, which
// motion blur does not change.
export function measureDisc(
  frame: Uint8Array,
  background: Uint8Array,
  width: number,
  height: number,
  seed: Seed,
  motion: { x: number; y: number },
  buffers: MeasureBuffers,
): DiscMeasurement | null {
  let half = Math.ceil(seed.major / 2 + 0.75 * seed.d + 6);
  // If the silhouette runs into the search window's edge (seed too small,
  // or long blur), widen the window once and segment again.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = measureInWindow(
      frame,
      background,
      width,
      height,
      seed,
      motion,
      buffers,
      half,
    );
    if (result !== "clipped") return result;
    half = Math.ceil(half * 1.7);
  }
  return null;
}

function measureInWindow(
  frame: Uint8Array,
  background: Uint8Array,
  width: number,
  height: number,
  seed: Seed,
  motion: { x: number; y: number },
  buffers: MeasureBuffers,
  half: number,
): DiscMeasurement | null | "clipped" {
  const rect = {
    x0: Math.max(0, Math.floor(seed.x - half)),
    y0: Math.max(0, Math.floor(seed.y - half)),
    x1: Math.min(width - 1, Math.ceil(seed.x + half)),
    y1: Math.min(height - 1, Math.ceil(seed.y + half)),
  };
  if (rect.x1 <= rect.x0 || rect.y1 <= rect.y0) return null;

  const { mask, histogram } = buffers;
  histogram.fill(0);
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = y * width + x;
      histogram[Math.abs(frame[i] - background[i])]++;
    }
  }
  const threshold = Math.max(MIN_THRESHOLD, otsuThreshold(histogram));
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = y * width + x;
      mask[i] = Math.abs(frame[i] - background[i]) > threshold ? 1 : 0;
    }
  }

  const blobs = findBlobs(mask, width, height, buffers.labels, {
    minPixels: MIN_PIXELS,
    rect,
  });
  const reach = seed.d + seed.major / 2;
  let best: BlobStats | null = null;
  for (const blob of blobs) {
    const bx = blob.sumX / blob.count;
    const by = blob.sumY / blob.count;
    if (Math.hypot(bx - seed.x, by - seed.y) > reach) continue;
    if (!best || blob.count > best.count) best = blob;
  }
  if (!best) return null;
  if (
    (best.minX === rect.x0 && rect.x0 > 0) ||
    (best.minY === rect.y0 && rect.y0 > 0) ||
    (best.maxX === rect.x1 && rect.x1 < width - 1) ||
    (best.maxY === rect.y1 && rect.y1 < height - 1)
  ) {
    return "clipped";
  }

  const region = fillHoles(mask, width, best);
  const shape = shapeFromSums(
    region.count,
    region.sumX,
    region.sumY,
    region.sumXX,
    region.sumYY,
    region.sumXY,
  );
  const border =
    best.minX === 0 ||
    best.minY === 0 ||
    best.maxX === width - 1 ||
    best.maxY === height - 1;

  return {
    cx: shape.cx,
    cy: shape.cy,
    shape,
    diameter: widthAcross(shape, motion.x, motion.y),
    border,
    circle: border ? fitBoundaryCircle(region, width, height) : null,
  };
}

interface FilledRegion {
  x0: number;
  y0: number;
  w: number;
  h: number;
  inside: Uint8Array;
  count: number;
  sumX: number;
  sumY: number;
  sumXX: number;
  sumYY: number;
  sumXY: number;
}

// Takes the chosen blob's bounding box, marks everything reachable from the
// box edge without crossing the blob as outside, and treats the rest (the
// blob plus any holes) as the disc.
function fillHoles(
  mask: Uint8Array,
  width: number,
  blob: BlobStats,
): FilledRegion {
  const x0 = blob.minX - 1;
  const y0 = blob.minY - 1;
  const w = blob.maxX - blob.minX + 3;
  const h = blob.maxY - blob.minY + 3;
  // Re-flood just the chosen blob (8-connected, like findBlobs) so other
  // foreground pixels inside its bounding box aren't mistaken for it.
  const own = new Uint8Array(w * h);
  const toLocal = (x: number, y: number) => (y - y0) * w + (x - x0);
  const blobStack: number[] = [blob.start];
  own[toLocal(blob.start % width, Math.floor(blob.start / width))] = 1;
  while (blobStack.length) {
    const idx = blobStack.pop()!;
    const x = idx % width;
    const y = (idx - x) / width;
    for (let ny = y - 1; ny <= y + 1; ny++) {
      for (let nx = x - 1; nx <= x + 1; nx++) {
        if (
          nx < blob.minX ||
          nx > blob.maxX ||
          ny < blob.minY ||
          ny > blob.maxY
        )
          continue;
        const local = toLocal(nx, ny);
        if (own[local] || !mask[ny * width + nx]) continue;
        own[local] = 1;
        blobStack.push(ny * width + nx);
      }
    }
  }

  const outside = new Uint8Array(w * h);
  const isBlob = (lx: number, ly: number) => own[ly * w + lx] === 1;

  const stack: number[] = [];
  for (let lx = 0; lx < w; lx++) {
    stack.push(lx, (h - 1) * w + lx);
  }
  for (let ly = 0; ly < h; ly++) {
    stack.push(ly * w, ly * w + w - 1);
  }
  while (stack.length) {
    const idx = stack.pop()!;
    if (outside[idx]) continue;
    const lx = idx % w;
    const ly = (idx - lx) / w;
    if (isBlob(lx, ly)) continue;
    outside[idx] = 1;
    if (lx > 0) stack.push(idx - 1);
    if (lx < w - 1) stack.push(idx + 1);
    if (ly > 0) stack.push(idx - w);
    if (ly < h - 1) stack.push(idx + w);
  }

  const inside = new Uint8Array(w * h);
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  for (let ly = 0; ly < h; ly++) {
    for (let lx = 0; lx < w; lx++) {
      const idx = ly * w + lx;
      if (outside[idx]) continue;
      inside[idx] = 1;
      const x = x0 + lx;
      const y = y0 + ly;
      count++;
      sumX += x;
      sumY += y;
      sumXX += x * x;
      sumYY += y * y;
      sumXY += x * y;
    }
  }
  return { x0, y0, w, h, inside, count, sumX, sumY, sumXX, sumYY, sumXY };
}

// For a disc cut off by the image edge the silhouette's centroid is pulled
// inwards. Fitting a circle (Kåsa algebraic fit) to the silhouette boundary
// away from the image edge recovers the centre and radius.
function fitBoundaryCircle(
  region: FilledRegion,
  width: number,
  height: number,
): { cx: number; cy: number; r: number } | null {
  const xs: number[] = [];
  const ys: number[] = [];
  const { x0, y0, w, h, inside } = region;
  for (let ly = 1; ly < h - 1; ly++) {
    for (let lx = 1; lx < w - 1; lx++) {
      const idx = ly * w + lx;
      if (!inside[idx]) continue;
      const x = x0 + lx;
      const y = y0 + ly;
      if (x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1) continue;
      if (
        !inside[idx - 1] ||
        !inside[idx + 1] ||
        !inside[idx - w] ||
        !inside[idx + w]
      ) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  if (xs.length < MIN_CIRCLE_POINTS) return null;

  // Minimise Σ (x² + y² + A·x + B·y + C)² — linear in A, B, C.
  const m = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const r = [0, 0, 0];
  for (let i = 0; i < xs.length; i++) {
    const row = [xs[i], ys[i], 1];
    const z = -(xs[i] * xs[i] + ys[i] * ys[i]);
    for (let a = 0; a < 3; a++) {
      r[a] += row[a] * z;
      for (let b = 0; b < 3; b++) m[a][b] += row[a] * row[b];
    }
  }
  const sol = solve3(m, r);
  if (!sol) return null;
  const [A, B, C] = sol;
  const cx = -A / 2;
  const cy = -B / 2;
  const rr = cx * cx + cy * cy - C;
  if (!(rr > 0)) return null;
  return { cx, cy, r: Math.sqrt(rr) };
}

function solve3(m: number[][], r: number[]): number[] | null {
  const a = m.map((row, i) => [...row, r[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = 0; row < 3; row++) {
      if (row === col) continue;
      const f = a[row][col] / a[col][col];
      for (let k = col; k < 4; k++) a[row][k] -= f * a[col][k];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}
