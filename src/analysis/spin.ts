import { sampleBilinear } from "../vision/image";

// Spin is measured from a single radial strip of tape on the underside of
// the disc. Angles use image coordinates (x right, y down), so a positive
// angular rate is clockwise *on screen*. The camera looks up at the
// underside, so clockwise on screen is counter-clockwise seen from above.

export type RotationSense = "cw" | "ccw"; // as seen from above

const RING_RADII = [0.3, 0.42, 0.54, 0.66, 0.78];
const DEFAULT_BINS = 72;

export interface MarkerReading {
  angle: number; // radians, image convention
  score: number; // peak height over robust noise
}

export interface MarkerMeasurement {
  bright: MarkerReading;
  dark: MarkerReading;
}

// Samples the disc's brightness around an annulus, high-passes the
// resulting angular profile (removing smooth shading, e.g. one side of
// the underside lit more than the other — shading that is fixed in the
// world and would otherwise drag the angle towards a constant) and locates
// the strongest narrow peak, for both a bright and a dark marker.
export function measureMarker(
  img: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  bins = DEFAULT_BINS,
): MarkerMeasurement | null {
  if (radius < 6) return null;
  const profile = new Float64Array(bins);
  for (let j = 0; j < bins; j++) {
    const a = (2 * Math.PI * j) / bins;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    let sum = 0;
    for (const f of RING_RADII) {
      const value = sampleBilinear(
        img,
        width,
        height,
        cx + f * radius * ca,
        cy + f * radius * sa,
      );
      if (Number.isNaN(value)) return null;
      sum += value;
    }
    profile[j] = sum / RING_RADII.length;
  }

  const window = Math.max(3, Math.round(bins / 4)) | 1;
  const half = window >> 1;
  const hp = new Float64Array(bins);
  for (let j = 0; j < bins; j++) {
    let s = 0;
    for (let k = -half; k <= half; k++) s += profile[(j + k + bins) % bins];
    hp[j] = profile[j] - s / window;
  }

  const sorted = Array.from(hp).sort((a, b) => a - b);
  const med = sorted[bins >> 1];
  const deviations = Array.from(hp, (v) => Math.abs(v - med)).sort(
    (a, b) => a - b,
  );
  const noise = Math.max(1.4826 * deviations[bins >> 1], 0.5);

  let maxJ = 0;
  let minJ = 0;
  for (let j = 1; j < bins; j++) {
    if (hp[j] > hp[maxJ]) maxJ = j;
    if (hp[j] < hp[minJ]) minJ = j;
  }
  return {
    bright: {
      angle: peakAngle(hp, maxJ, bins),
      score: (hp[maxJ] - med) / noise,
    },
    dark: {
      angle: peakAngle(hp, minJ, bins),
      score: (med - hp[minJ]) / noise,
    },
  };
}

function peakAngle(values: Float64Array, j: number, bins: number): number {
  const y0 = values[(j - 1 + bins) % bins];
  const y1 = values[j];
  const y2 = values[(j + 1) % bins];
  const denom = y0 - 2 * y1 + y2;
  const offset = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  return wrapAngle((2 * Math.PI * (j + offset)) / bins);
}

export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r > Math.PI) r -= 2 * Math.PI;
  if (r <= -Math.PI) r += 2 * Math.PI;
  return r;
}

export interface SpinSample {
  t: number; // seconds
  angle: number;
  score: number;
}

const MIN_MARKER_SCORE = 4;

/**
 * Picks the marker polarity (bright tape or dark tape) with the stronger
 * total response and returns the frames where it was clearly visible.
 */
export function selectMarkerSamples(
  measurements: { t: number; marker: MarkerMeasurement }[],
  minScore = MIN_MARKER_SCORE,
): SpinSample[] {
  const bright = measurements.reduce((s, m) => s + m.marker.bright.score, 0);
  const dark = measurements.reduce((s, m) => s + m.marker.dark.score, 0);
  const key = bright >= dark ? "bright" : "dark";
  return measurements
    .map((m) => ({ t: m.t, ...m.marker[key] }))
    .filter((s) => s.score >= minScore);
}

export interface SpinConfig {
  preferredSign: 1 | -1; // expected sign of the image-convention rate
  minRps?: number;
  maxRps?: number;
}

export interface SpinResult {
  revsPerSecond: number; // signed, image convention
  rpm: number;
  directionFromAbove: RotationSense;
  framesUsed: number;
  confidence: "high" | "medium" | "low";
}

const GRID_STEP_RPS = 0.01;
const TIE_TOLERANCE = 0.02;

// The marker turns ω·Δt between frames, which is usually more than half a
// turn, so every phase difference fits a comb of rates (Δφ + 2πn)/Δt.
// Rather than unwrapping pairwise, search the plausible range for the rate
// that explains every frame at once, maximising the phase coherence
//
//   C(ω) = |Σ_k exp(i·(φ_k − 2π·ω·t_k))| / K.
//
// Frame times off a regular grid (variable frame rate) break the alias
// comb; dropped frames don't, since the remaining frames still sit on the
// same grid. The expected spin direction (from the throw type) settles
// remaining ties, and such ties never get "high" confidence.
export function estimateSpin(
  samples: SpinSample[],
  config: SpinConfig,
): SpinResult | null {
  if (samples.length < 2) return null;
  const minRps = config.minRps ?? 3;
  const maxRps = config.maxRps ?? 35;
  const t0 = samples[0].t;
  const ts = samples.map((s) => s.t - t0);

  const steps = Math.round((2 * maxRps) / GRID_STEP_RPS);
  const rates: number[] = [];
  const coherence: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const w = -maxRps + i * GRID_STEP_RPS;
    rates.push(w);
    if (Math.abs(w) < minRps) {
      coherence.push(-1);
      continue;
    }
    let re = 0;
    let im = 0;
    for (let k = 0; k < samples.length; k++) {
      const phase = samples[k].angle - 2 * Math.PI * w * ts[k];
      re += Math.cos(phase);
      im += Math.sin(phase);
    }
    coherence.push(Math.hypot(re, im) / samples.length);
  }

  const peaks: { rate: number; c: number }[] = [];
  for (let i = 0; i < rates.length; i++) {
    const c = coherence[i];
    if (c < 0) continue;
    const left = i > 0 ? coherence[i - 1] : -1;
    const right = i < rates.length - 1 ? coherence[i + 1] : -1;
    if (c >= left && c >= right) peaks.push({ rate: rates[i], c });
  }
  if (peaks.length === 0) return null;
  const bestC = Math.max(...peaks.map((p) => p.c));
  const ties = peaks.filter((p) => p.c >= bestC - TIE_TOLERANCE);
  ties.sort((a, b) => {
    const sa = Math.sign(a.rate) === config.preferredSign ? 0 : 1;
    const sb = Math.sign(b.rate) === config.preferredSign ? 0 : 1;
    return sa - sb || Math.abs(a.rate) - Math.abs(b.rate);
  });
  const chosen = ties[0];

  // Refine: unwrap every phase against the chosen rate, then fit a line.
  const unwrapped = samples.map(
    (s, k) =>
      2 * Math.PI * chosen.rate * ts[k] +
      wrapAngle(s.angle - samples[0].angle - 2 * Math.PI * chosen.rate * ts[k]),
  );
  let st = 0;
  let sp = 0;
  for (let k = 0; k < ts.length; k++) {
    st += ts[k];
    sp += unwrapped[k];
  }
  const tMean = st / ts.length;
  const pMean = sp / ts.length;
  let stt = 0;
  let stp = 0;
  for (let k = 0; k < ts.length; k++) {
    stt += (ts[k] - tMean) ** 2;
    stp += (ts[k] - tMean) * (unwrapped[k] - pMean);
  }
  const rate = stt > 0 ? stp / stt / (2 * Math.PI) : chosen.rate;

  const rivals = peaks.filter((p) => Math.abs(p.rate - chosen.rate) > 1);
  const rivalC = rivals.length ? Math.max(...rivals.map((p) => p.c)) : 0;
  const uniqueInPreferred =
    ties.filter((p) => Math.sign(p.rate) === config.preferredSign).length === 1;

  let confidence: SpinResult["confidence"];
  if (samples.length >= 3 && chosen.c > 0.9 && chosen.c - rivalC > 0.15) {
    confidence = "high";
  } else if (
    (samples.length >= 3 && chosen.c > 0.8) ||
    (samples.length === 2 && uniqueInPreferred)
  ) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    revsPerSecond: rate,
    rpm: Math.abs(rate) * 60,
    directionFromAbove: rate > 0 ? "ccw" : "cw",
    framesUsed: samples.length,
    confidence,
  };
}
