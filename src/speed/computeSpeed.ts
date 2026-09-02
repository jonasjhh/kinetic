import { PROCESSING_HEIGHT, PROCESSING_WIDTH } from "../detection/constants";
import type { FrameSample, PassEvent } from "../detection/types";

export interface SpeedResult {
  speedMps: number;
  frameCount: number;
  durationMs: number;
}

interface Position3D {
  t: number;
  x: number;
  y: number;
  z: number;
}

// Pinhole camera model: the disc's ellipse-fitted major axis (see
// frameAnalyzer.ts) plus its known real diameter gives its distance from
// the camera at that instant (z = realDiameter * focalLength /
// apparentMajorAxis); that distance plus the pixel offset from the image
// center then gives its real x/y position. The major axis is used rather
// than a bounding-box width because it stays equal to the disc's true
// diameter regardless of tilt/bank, where a bounding box foreshortens.
function toPositions(
  frames: FrameSample[],
  focalLengthPx: number,
  discDiameterM: number,
): Position3D[] {
  const cx = PROCESSING_WIDTH / 2;
  const cy = PROCESSING_HEIGHT / 2;
  return frames
    .filter((f) => f.majorAxisPx > 0)
    .map((f) => {
      const z = (discDiameterM * focalLengthPx) / f.majorAxisPx;
      return {
        t: f.t,
        x: ((f.cx - cx) * z) / focalLengthPx,
        y: ((f.cy - cy) * z) / focalLengthPx,
        z,
      };
    });
}

// Ordinary least-squares slope of v against t — the velocity component
// implied by every sample at once, rather than just two of them.
function regressionSlope(t: number[], v: number[]): number {
  const n = t.length;
  let sumT = 0;
  let sumV = 0;
  let sumTT = 0;
  let sumTV = 0;
  for (let i = 0; i < n; i++) {
    sumT += t[i];
    sumV += v[i];
    sumTT += t[i] * t[i];
    sumTV += t[i] * v[i];
  }
  const denominator = n * sumTT - sumT * sumT;
  return denominator === 0 ? 0 : (n * sumTV - sumT * sumV) / denominator;
}

// Fits a straight-line velocity to the whole event — independently for
// x(t), y(t), z(t) — instead of dividing the first/last frame's
// displacement by elapsed time. Using only the endpoints makes the result
// highly sensitive to noise in exactly the two frames least likely to be
// clean (right at the edges of detection, where the blob is smallest and
// partially formed); a regression across every sample averages that out.
export function computeSpeed(
  event: PassEvent,
  focalLengthPx: number,
  discDiameterM: number,
): SpeedResult | null {
  const positions = toPositions(event.frames, focalLengthPx, discDiameterM);
  if (positions.length < 2) return null;

  const t0 = positions[0].t;
  const tSeconds = positions.map((p) => (p.t - t0) / 1000);
  const vx = regressionSlope(
    tSeconds,
    positions.map((p) => p.x),
  );
  const vy = regressionSlope(
    tSeconds,
    positions.map((p) => p.y),
  );
  const vz = regressionSlope(
    tSeconds,
    positions.map((p) => p.z),
  );

  return {
    speedMps: Math.sqrt(vx * vx + vy * vy + vz * vz),
    frameCount: positions.length,
    durationMs: positions[positions.length - 1].t - positions[0].t,
  };
}
