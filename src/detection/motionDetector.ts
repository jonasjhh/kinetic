import {
  createLabelBuffers,
  findBlobs,
  type LabelBuffers,
} from "../vision/components";
import { blobShape, touchesImageEdge } from "../vision/shape";
import type { Candidate } from "./types";

// Frames used to build the background before anything is reported. The
// model learns fast during warm-up, then slowly.
const WARMUP_FRAMES = 12;
const WARMUP_ALPHA = 0.25;
const BACKGROUND_ALPHA = 0.04;
const VARIANCE_ALPHA = 0.02;
// Foreground pixels are still absorbed, just very slowly: a disc crossing
// in ~0.2s is unaffected, while something that parks in view (a person
// standing over the phone) fades into the background over a few seconds
// instead of blocking detection forever.
const FOREGROUND_ALPHA = 0.003;

// A pixel is foreground when it differs from the (gain-corrected)
// background by more than SIGMA_K of its own usual variation — so pixels
// that normally flicker (leaves, grass, cloud edges) need a much bigger
// change than steady sky does.
const SIGMA_K = 4;
const MIN_SIGMA = 3;
const MIN_DIFF = 16;
const INITIAL_VARIANCE = 36;

// A disc passing 1.5–5m up is ~10–35px across at detection resolution;
// anything much smaller is noise, anything far bigger is not a disc.
const MIN_BLOB_PIXELS = 20;
const MIN_DIAMETER_PX = 4.5;
const MAX_DIAMETER_FRACTION = 0.4; // of the image's short side
// Motion blur stretches a disc along its path, but not endlessly: long
// thin blobs are edges, wires or light bands.
const MAX_ELONGATION = 5;
// Share of a blob's pixels that also changed since the previous frame.
// Rejects stationary foreground (someone standing in view).
const MIN_MOVING_FRACTION = 0.25;
// Blob pixels / area of its moment-equivalent ellipse — rejects ragged,
// scattered blobs.
const MIN_FILL = 0.55;
const MAX_CANDIDATES = 40;

// This much of the frame changing at once means the phone itself moved
// (picked up, bumped): start the background over.
const RESET_FOREGROUND_FRACTION = 0.35;

// Gain estimate: histogram of frame/background ratios over a pixel subset.
const GAIN_BINS = 200;
const GAIN_MIN = 0.5;
const GAIN_MAX = 2;
const GAIN_SAMPLE_STEP = 7;

// Per-pixel background model (mean + variance) with global exposure-gain
// compensation. The camera's auto exposure is corrected for by estimating
// one frame-wide brightness ratio, instead of resetting the background —
// resetting would copy whatever is in view (including a disc) into it.
export class MotionDetector {
  readonly width: number;
  readonly height: number;
  private mean: Float32Array;
  private variance: Float32Array;
  private previous: Uint8Array;
  private foreground: Uint8Array;
  private moving: Uint8Array;
  private contrast: Float32Array; // signed difference from background
  private buffers: LabelBuffers;
  private gainHistogram = new Uint32Array(GAIN_BINS);
  private frames = 0;
  lastMeanLuma = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const n = width * height;
    this.mean = new Float32Array(n);
    this.variance = new Float32Array(n);
    this.previous = new Uint8Array(n);
    this.foreground = new Uint8Array(n);
    this.moving = new Uint8Array(n);
    this.contrast = new Float32Array(n);
    this.buffers = createLabelBuffers(n);
  }

  get warmedUp(): boolean {
    return this.frames > WARMUP_FRAMES;
  }

  reset(): void {
    this.frames = 0;
  }

  process(frame: Uint8Array): Candidate[] {
    const n = this.width * this.height;
    const { mean, variance, previous, foreground, moving, contrast } = this;

    let lumaSum = 0;
    for (let i = 0; i < n; i++) lumaSum += frame[i];
    this.lastMeanLuma = lumaSum / n;

    if (this.frames === 0) {
      for (let i = 0; i < n; i++) mean[i] = frame[i];
      variance.fill(INITIAL_VARIANCE);
      previous.set(frame);
      this.frames = 1;
      return [];
    }

    if (!this.warmedUp) {
      for (let i = 0; i < n; i++) {
        const d = frame[i] - mean[i];
        mean[i] += d * WARMUP_ALPHA;
        variance[i] += (d * d - variance[i]) * WARMUP_ALPHA;
        if (variance[i] < MIN_SIGMA * MIN_SIGMA)
          variance[i] = MIN_SIGMA * MIN_SIGMA;
      }
      previous.set(frame);
      this.frames++;
      return [];
    }

    const gain = this.estimateGain(frame);
    let foregroundCount = 0;
    for (let i = 0; i < n; i++) {
      const value = frame[i];
      const expected = gain * mean[i];
      const threshold = Math.max(
        MIN_DIFF,
        SIGMA_K * gain * Math.sqrt(variance[i]),
      );
      contrast[i] = value - expected;
      const isForeground = Math.abs(value - expected) > threshold ? 1 : 0;
      foreground[i] = isForeground;
      foregroundCount += isForeground;
      moving[i] = Math.abs(value - previous[i]) > MIN_DIFF ? 1 : 0;
    }

    if (foregroundCount > n * RESET_FOREGROUND_FRACTION) {
      this.frames = 0;
      return [];
    }

    const blobs = findBlobs(foreground, this.width, this.height, this.buffers, {
      minPixels: MIN_BLOB_PIXELS,
      aux: moving,
      values: contrast,
    });

    for (let i = 0; i < n; i++) {
      const d = frame[i] / gain - mean[i];
      if (foreground[i]) {
        mean[i] += d * FOREGROUND_ALPHA;
      } else {
        mean[i] += d * BACKGROUND_ALPHA;
        variance[i] += (d * d - variance[i]) * VARIANCE_ALPHA;
        if (variance[i] < MIN_SIGMA * MIN_SIGMA)
          variance[i] = MIN_SIGMA * MIN_SIGMA;
      }
    }
    previous.set(frame);
    this.frames++;

    const candidates: Candidate[] = [];
    for (const blob of blobs) {
      if (blob.auxCount / blob.count < MIN_MOVING_FRACTION) continue;
      const shape = blobShape(blob);
      if (shape.minor < MIN_DIAMETER_PX) continue;
      if (
        shape.minor >
        MAX_DIAMETER_FRACTION * Math.min(this.width, this.height)
      )
        continue;
      if (shape.major > MAX_ELONGATION * shape.minor) continue;
      const ellipseArea = (Math.PI / 4) * shape.major * shape.minor;
      if (blob.count / ellipseArea < MIN_FILL) continue;
      candidates.push({
        x: shape.cx,
        y: shape.cy,
        major: shape.major,
        minor: shape.minor,
        count: blob.count,
        contrast: blob.valueSum / blob.count,
        border: touchesImageEdge(blob, this.width, this.height),
      });
    }
    candidates.sort((a, b) => b.count - a.count);
    return candidates.length > MAX_CANDIDATES
      ? candidates.slice(0, MAX_CANDIDATES)
      : candidates;
  }

  /** Median of frame/background over a pixel subset, ignoring clipped pixels. */
  private estimateGain(frame: Uint8Array): number {
    const histogram = this.gainHistogram;
    histogram.fill(0);
    let samples = 0;
    const n = this.width * this.height;
    for (let i = 0; i < n; i += GAIN_SAMPLE_STEP) {
      const value = frame[i];
      const bg = this.mean[i];
      if (value < 6 || value > 249 || bg < 8) continue;
      const ratio = value / bg;
      if (ratio < GAIN_MIN || ratio >= GAIN_MAX) continue;
      histogram[
        Math.floor(((ratio - GAIN_MIN) / (GAIN_MAX - GAIN_MIN)) * GAIN_BINS)
      ]++;
      samples++;
    }
    if (samples < 100) return 1;
    let seen = 0;
    for (let b = 0; b < GAIN_BINS; b++) {
      seen += histogram[b];
      if (seen * 2 >= samples) {
        return GAIN_MIN + ((b + 0.5) / GAIN_BINS) * (GAIN_MAX - GAIN_MIN);
      }
    }
    return 1;
  }
}
