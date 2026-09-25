import { fitLine } from "../math/fit";

// Pinhole camera looking straight up, focal length f (px), principal point
// (cu, cv). A flat disc of diameter D at (X, Y, Z) images as a circle:
//
//   u = cu + f·X/Z,   v = cv + f·Y/Z,   d = f·D/Z
//
// Dividing the image offset by the apparent diameter cancels both f and Z:
//
//   p = (u − cu)/d = X/D,   q = (v − cv)/d = Y/D
//
// so for straight-line flight p(t), q(t) are exactly linear in time and
// their slopes give the horizontal velocity with no calibration at all:
// vx = D·ṗ, vy = D·q̇. Height enters only through 1/d = Z/(f·D), which is
// linear in t with slope vz/(f·D); that is the only place f is needed.

export interface KinematicSample {
  t: number; // seconds
  u: number;
  v: number;
  d: number; // apparent diameter, px
  sigmaD: number; // expected 1σ error of d, px
  weight: number; // relative weight for the position fit
}

export interface KinematicConfig {
  cu: number;
  cv: number;
  focalLengthPx: number;
  discDiameterM: number;
  // Prior 1σ on vertical speed. Keeps two- or three-frame fits from
  // turning diameter noise into a large, spurious climb/descent rate.
  verticalSpeedPriorMps?: number;
}

export interface KinematicFit {
  vx: number;
  vy: number;
  vz: number; // positive = rising (moving away from the camera)
  horizontalSpeedMps: number;
  speedMps: number;
  heightM: number; // at the middle of the pass
  launchAngleDeg: number;
  // Direction of travel in the image: 0° = towards the top of the image
  // (the phone's top edge), 90° = towards its right edge.
  headingDeg: number;
  rmsResidualM: number;
}

export function fitKinematics(
  samples: KinematicSample[],
  config: KinematicConfig,
): KinematicFit | null {
  if (samples.length < 2) return null;
  const { cu, cv, focalLengthPx: f, discDiameterM: D } = config;
  const sigmaVz = config.verticalSpeedPriorMps ?? 6;

  // Weighted fit of w = 1/d = a + b·(t − t̄) with a Gaussian prior on b.
  let sw = 0;
  let swt = 0;
  for (const s of samples) {
    const omega = inverseVarianceOfInverse(s);
    sw += omega;
    swt += omega * s.t;
  }
  const tMean = swt / sw;
  let s00 = 0;
  let s01 = 0;
  let s11 = 0;
  let r0 = 0;
  let r1 = 0;
  for (const s of samples) {
    const omega = inverseVarianceOfInverse(s);
    const tc = s.t - tMean;
    const w = 1 / s.d;
    s00 += omega;
    s01 += omega * tc;
    s11 += omega * tc * tc;
    r0 += omega * w;
    r1 += omega * tc * w;
  }
  const sigmaB = sigmaVz / (f * D);
  s11 += 1 / (sigmaB * sigmaB);
  const det = s00 * s11 - s01 * s01;
  if (!(det > 0)) return null;
  const a = (r0 * s11 - r1 * s01) / det;
  const b = (s00 * r1 - s01 * r0) / det;

  const t = samples.map((s) => s.t);
  const weights = samples.map((s) => s.weight);
  const p = samples.map((s) => (s.u - cu) * (a + b * (s.t - tMean)));
  const q = samples.map((s) => (s.v - cv) * (a + b * (s.t - tMean)));
  const fp = fitLine(t, p, weights);
  const fq = fitLine(t, q, weights);

  const vx = D * fp.slope;
  const vy = D * fq.slope;
  const vz = f * D * b;
  const horizontal = Math.hypot(vx, vy);
  const speed = Math.hypot(horizontal, vz);
  return {
    vx,
    vy,
    vz,
    horizontalSpeedMps: horizontal,
    speedMps: speed,
    heightM: f * D * a,
    launchAngleDeg: (Math.atan2(vz, horizontal) * 180) / Math.PI,
    headingDeg: (Math.atan2(vx, -vy) * 180) / Math.PI,
    rmsResidualM: D * Math.hypot(fp.rms, fq.rms),
  };
}

// σ(1/d) ≈ σ(d)/d², so the weight of each 1/d observation is d⁴/σ(d)².
function inverseVarianceOfInverse(s: KinematicSample): number {
  const sigmaW = s.sigmaD / (s.d * s.d);
  return 1 / (sigmaW * sigmaW);
}
