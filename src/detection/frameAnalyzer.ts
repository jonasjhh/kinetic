import { PROCESSING_HEIGHT, PROCESSING_WIDTH } from "./constants";
import { drawVideoFrameCover } from "./drawVideoFrame";
import type { FrameSample } from "./types";

const DIFF_THRESHOLD = 28; // per-pixel luma change to count as "moved"

// How fast background pixels drift toward the live image. Only pixels NOT
// currently flagged foreground are updated (see the selective update
// below), so this can be fairly aggressive without ever "absorbing" a
// real object mid-flight, however long its pass takes.
const BACKGROUND_ALPHA = 0.05;

const MIN_BLOB_PIXELS = 40; // ignore sensor noise / tiny flicker
const MIN_BLOB_DENSITY = 0.25; // pixelCount / bbox area — rejects sparse, scattered noise

// A disc crossing overhead should only ever cover a modest patch of the
// frame. Real cameras constantly hunt for exposure/white-balance, and a
// sudden shift brightens or darkens the *entire* frame at once, which
// looks exactly like one huge object appearing everywhere simultaneously.
const MAX_FOREGROUND_FRACTION = 0.2;
const MAX_FOREGROUND_PIXELS = Math.round(
  PROCESSING_WIDTH * PROCESSING_HEIGHT * MAX_FOREGROUND_FRACTION,
);
const MAX_BLOB_FRACTION = 0.5;
const MAX_BLOB_PIXELS = Math.round(
  PROCESSING_WIDTH * PROCESSING_HEIGHT * MAX_BLOB_FRACTION,
);

interface Blob {
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
}

// Motion detector built on background subtraction + connected-component
// blob detection: draws each video frame onto a small canvas, compares it
// (in grayscale) against a slowly-adapting background model, groups the
// pixels that differ into connected blobs, and reports the single largest
// one. Using a maintained background — rather than diffing against just
// the previous frame — means the thrower's arm, background clutter, or
// gradual lighting drift can move elsewhere in the frame without merging
// into the disc's own tracked region; blob detection keeps them as
// separate candidates instead of one frame-spanning bounding box.
export class FrameAnalyzer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private background: Float32Array | null = null;
  private lastVideoTime = -1;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = PROCESSING_WIDTH;
    this.canvas.height = PROCESSING_HEIGHT;
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  /**
   * Call once per animation frame. Returns null when the video hasn't
   * produced a new frame yet, or when no single blob looks disc-sized.
   */
  sample(video: HTMLVideoElement, now: number): FrameSample | null {
    if (video.readyState < 2) return null;
    if (video.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = video.currentTime;

    drawVideoFrameCover(this.ctx, video, PROCESSING_WIDTH, PROCESSING_HEIGHT);
    const { data } = this.ctx.getImageData(
      0,
      0,
      PROCESSING_WIDTH,
      PROCESSING_HEIGHT,
    );

    const pixelCount = PROCESSING_WIDTH * PROCESSING_HEIGHT;
    const luma = new Float32Array(pixelCount);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      luma[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    if (!this.background) {
      this.background = luma.slice();
      return null;
    }

    const background = this.background;
    const foreground = new Uint8Array(pixelCount);
    let totalForeground = 0;
    for (let i = 0; i < pixelCount; i++) {
      if (Math.abs(luma[i] - background[i]) > DIFF_THRESHOLD) {
        foreground[i] = 1;
        totalForeground++;
      }
    }

    // Near-uniform frame-wide brightness jump: can't be an object this
    // small a camera would ever see. Snap the background to the current
    // frame so the next frame starts clean, rather than staying stale and
    // flagging every subsequent frame as foreground too.
    if (totalForeground > MAX_FOREGROUND_PIXELS) {
      this.background = luma.slice();
      return null;
    }

    for (let i = 0; i < pixelCount; i++) {
      if (!foreground[i]) {
        background[i] += (luma[i] - background[i]) * BACKGROUND_ALPHA;
      }
    }

    const blob = findLargestBlob(
      foreground,
      PROCESSING_WIDTH,
      PROCESSING_HEIGHT,
    );
    if (!blob) return null;
    if (blob.count < MIN_BLOB_PIXELS || blob.count > MAX_BLOB_PIXELS) {
      return null;
    }

    const width = blob.maxX - blob.minX + 1;
    const height = blob.maxY - blob.minY + 1;
    if (blob.count / (width * height) < MIN_BLOB_DENSITY) return null;

    const cx = blob.sumX / blob.count;
    const cy = blob.sumY / blob.count;

    return {
      t: now,
      cx,
      cy,
      width,
      height,
      pixelCount: blob.count,
      majorAxisPx: ellipseMajorAxis(blob, cx, cy),
    };
  }

  reset() {
    this.background = null;
    this.lastVideoTime = -1;
  }
}

// Iterative flood fill (4-connectivity) over the foreground mask, keeping
// only the largest connected blob — background clutter or the thrower's
// hand shows up as separate, usually smaller, blobs elsewhere in frame.
function findLargestBlob(
  foreground: Uint8Array,
  width: number,
  height: number,
): Blob | null {
  const visited = new Uint8Array(foreground.length);
  const stack: number[] = [];
  let best: Blob | null = null;

  for (let start = 0; start < foreground.length; start++) {
    if (!foreground[start] || visited[start]) continue;

    const blob: Blob = {
      count: 0,
      sumX: 0,
      sumY: 0,
      sumXX: 0,
      sumYY: 0,
      sumXY: 0,
      minX: width,
      maxX: -1,
      minY: height,
      maxY: -1,
    };
    visited[start] = 1;
    stack.push(start);

    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx / width) | 0;

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

      if (x > 0) {
        const n = idx - 1;
        if (foreground[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (x < width - 1) {
        const n = idx + 1;
        if (foreground[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (y > 0) {
        const n = idx - width;
        if (foreground[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (y < height - 1) {
        const n = idx + width;
        if (foreground[n] && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }

    if (!best || blob.count > best.count) best = blob;
  }

  return best;
}

// Fits an ellipse to the blob via its second-order image moments (the 2D
// analogue of PCA) and returns its major-axis length — the disc's true
// diameter regardless of how it's banked/tilted in flight. An
// axis-aligned bounding box instead foreshortens under tilt (and can be
// thrown off further if the tilt isn't aligned with the image axes),
// reading narrower than the disc really is and skewing the distance
// estimate that's built on it.
function ellipseMajorAxis(blob: Blob, cx: number, cy: number): number {
  const muXX = blob.sumXX / blob.count - cx * cx;
  const muYY = blob.sumYY / blob.count - cy * cy;
  const muXY = blob.sumXY / blob.count - cx * cy;

  const trace = muXX + muYY;
  const diff = muXX - muYY;
  const discriminant = Math.sqrt(diff * diff + 4 * muXY * muXY);
  const largestEigenvalue = (trace + discriminant) / 2;

  // For a uniformly-filled ellipse, variance along an axis = (semi-axis)^2 / 4,
  // so the full major-axis length is 2 * 2 * sqrt(eigenvalue).
  return 4 * Math.sqrt(Math.max(largestEigenvalue, 0));
}
