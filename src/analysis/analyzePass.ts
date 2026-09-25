import { fitLine } from "../math/fit";
import { createLabelBuffers } from "../vision/components";
import { widthAcross } from "../vision/shape";
import { fitKinematics, type KinematicSample } from "./kinematics";
import {
  measureDisc,
  type DiscMeasurement,
  type MeasureBuffers,
} from "./measureDisc";
import { estimateSpin, measureMarker, selectMarkerSamples } from "./spin";
import { regularizeTimestamps } from "./timestamps";
import {
  expectedSpinSign,
  focalLengthPx,
  type AnalysisConfig,
  type Confidence,
  type PassOutcome,
  type PassPayload,
} from "./types";

const MAX_MEDIAN_FRAMES = 15;
const MIN_PLAUSIBLE_MPS = 2;
const MAX_PLAUSIBLE_MPS = 60;
const BORDER_WEIGHT = 0.3;

interface FrameMeasurement {
  t: number; // seconds
  data: Uint8Array;
  m: DiscMeasurement;
}

// Full-resolution analysis of one detected pass, run off the capture path:
// median background → per-frame disc silhouette → kinematic fit (speed) →
// marker angles (spin).
export function analyzePass(
  payload: PassPayload,
  config: AnalysisConfig,
): PassOutcome {
  const { width, height, detScale, frames, detection } = payload;
  if (frames.length < 2) {
    return { ok: false, reason: "Too few frames were captured for this pass." };
  }

  const times = regularizeTimestamps(
    frames.map((f) => f.t),
    payload.framePeriodUs,
  );
  const frameTime = new Map<number, number>();
  frames.forEach((f, i) => frameTime.set(f.frameIndex, times[i]));

  // The detector's track (detection px, per detection time) predicts where
  // to look in every frame, including frames it didn't report — typically
  // the disc half-entered or half-left at either end of the pass.
  const toStored = (v: number) => (v + 0.5) * detScale - 0.5;
  const detPoints = detection.points.filter((p) => frameTime.has(p.frame));
  if (detPoints.length < 2) {
    return { ok: false, reason: "Pass frames were no longer buffered." };
  }
  const dt = detPoints.map((p) => frameTime.get(p.frame)!);
  const trackX = fitLine(
    dt,
    detPoints.map((p) => toStored(p.x)),
  );
  const trackY = fitLine(
    dt,
    detPoints.map((p) => toStored(p.y)),
  );
  const seedDiameter = detection.diameterPx * detScale;
  const seedMajor =
    Math.max(...detection.points.map((p) => p.major)) * detScale;
  let motion = unit(trackX.slope, trackY.slope);

  const background = medianBackground(payload, seedMajor + seedDiameter);
  const buffers: MeasureBuffers = {
    mask: new Uint8Array(width * height),
    labels: createLabelBuffers(width * height),
    histogram: new Uint32Array(256),
  };

  const measured: FrameMeasurement[] = [];
  frames.forEach((frame, i) => {
    const t = times[i];
    const x = trackX.intercept + trackX.slope * t;
    const y = trackY.intercept + trackY.slope * t;
    const r = seedDiameter / 2;
    if (x < -r || y < -r || x > width - 1 + r || y > height - 1 + r) return;
    const m = measureDisc(
      frame.data,
      background,
      width,
      height,
      { x, y, d: seedDiameter, major: seedMajor },
      motion,
      buffers,
    );
    if (m) measured.push({ t, data: frame.data, m });
  });

  let full = measured.filter((f) => !f.m.border);
  full = rejectSizeOutliers(full);
  if (full.length >= 2) {
    const fx = fitLine(
      full.map((f) => f.t),
      full.map((f) => f.m.cx),
    );
    const fy = fitLine(
      full.map((f) => f.t),
      full.map((f) => f.m.cy),
    );
    motion = unit(fx.slope, fy.slope);
    for (const f of full) {
      f.m.diameter = widthAcross(f.m.shape, motion.x, motion.y);
    }
  }

  const samples: KinematicSample[] = full.map((f) => ({
    t: f.t,
    u: f.m.cx,
    v: f.m.cy,
    d: f.m.diameter,
    sigmaD: 0.015 * f.m.diameter + 0.7,
    weight: 1,
  }));
  if (full.length < 3) {
    for (const f of measured) {
      if (!f.m.border || !f.m.circle) continue;
      const d = 2 * f.m.circle.r;
      samples.push({
        t: f.t,
        u: f.m.circle.cx,
        v: f.m.circle.cy,
        d,
        sigmaD: 3 * (0.015 * d + 0.7),
        weight: BORDER_WEIGHT,
      });
    }
  }
  if (samples.length < 2) {
    return {
      ok: false,
      reason: "The disc wasn't clearly visible in enough frames.",
    };
  }
  samples.sort((a, b) => a.t - b.t);

  const f = focalLengthPx(width, height, config.fovLongSideDeg);
  const fit = fitKinematics(samples, {
    cu: (width - 1) / 2,
    cv: (height - 1) / 2,
    focalLengthPx: f,
    discDiameterM: config.discDiameterM,
  });
  if (!fit) return { ok: false, reason: "Speed fit failed." };
  if (fit.speedMps < MIN_PLAUSIBLE_MPS || fit.speedMps > MAX_PLAUSIBLE_MPS) {
    return {
      ok: false,
      reason: `Implausible speed (${fit.speedMps.toFixed(1)} m/s) — probably not a disc.`,
    };
  }

  let confidence: Confidence;
  if (full.length >= 3 && fit.rmsResidualM < 0.04) confidence = "high";
  else if (full.length >= 2 && fit.rmsResidualM < 0.1) confidence = "medium";
  else confidence = "low";

  const markerMeasurements = full.flatMap((fm) => {
    const marker = measureMarker(
      fm.data,
      width,
      height,
      fm.m.cx,
      fm.m.cy,
      fm.m.diameter / 2,
    );
    return marker ? [{ t: fm.t, marker }] : [];
  });
  const spinSamples = selectMarkerSamples(markerMeasurements);
  const spin = estimateSpin(spinSamples, {
    preferredSign: expectedSpinSign(config.throwType),
  });
  const spinNote = spin
    ? null
    : "Spin marker not seen — put a strip of light tape from the centre to the rim on the underside.";

  return {
    ok: true,
    speedMps: fit.speedMps,
    horizontalSpeedMps: fit.horizontalSpeedMps,
    verticalSpeedMps: fit.vz,
    launchAngleDeg: fit.launchAngleDeg,
    headingDeg: fit.headingDeg,
    heightM: fit.heightM,
    framesUsed: samples.length,
    confidence,
    spin,
    spinNote,
  };
}

function unit(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  return len > 0 ? { x: x / len, y: y / len } : { x: 1, y: 0 };
}

// A frame whose silhouette merged with something else (a shadow, a leaf)
// shows up as a diameter far from the rest.
function rejectSizeOutliers(frames: FrameMeasurement[]): FrameMeasurement[] {
  if (frames.length < 3) return frames;
  const sizes = frames.map((f) => f.m.diameter).sort((a, b) => a - b);
  const med = sizes[sizes.length >> 1];
  return frames.filter((f) => Math.abs(f.m.diameter / med - 1) < 0.2);
}

// Per-pixel median over the frames just before the pass plus a spread of
// the pass frames themselves. The disc covers any given pixel in only a
// few of them, so the median is the scene without the disc. Only computed
// inside the band the disc travels through.
function medianBackground(payload: PassPayload, margin: number): Uint8Array {
  const { width, height, detScale, detection } = payload;
  const background = new Uint8Array(width * height);

  const passFrames = payload.frames.map((f) => f.data);
  const room = Math.max(3, MAX_MEDIAN_FRAMES - payload.backgroundFrames.length);
  const step = Math.max(1, passFrames.length / room);
  const sources = [...payload.backgroundFrames];
  for (
    let i = 0;
    i < passFrames.length && sources.length < MAX_MEDIAN_FRAMES;
    i += step
  ) {
    sources.push(passFrames[Math.floor(i)]);
  }

  const xs = detection.points.map((p) => (p.x + 0.5) * detScale);
  const ys = detection.points.map((p) => (p.y + 0.5) * detScale);
  const pad = 2.5 * margin + 10;
  // The pass may continue past the detected points (partial frames at the
  // edges), so extend the band along the direction of travel to the image
  // edges.
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(...xs) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - pad));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(...ys) + pad));
  const spanX = x1 - x0;
  const spanY = y1 - y0;
  const rect =
    spanY >= spanX
      ? { x0, x1, y0: 0, y1: height - 1 }
      : { x0: 0, x1: width - 1, y0, y1 };

  const n = sources.length;
  const values = new Uint8Array(n);
  for (let y = rect.y0; y <= rect.y1; y++) {
    for (let x = rect.x0; x <= rect.x1; x++) {
      const i = y * width + x;
      for (let k = 0; k < n; k++) {
        const v = sources[k][i];
        let j = k - 1;
        while (j >= 0 && values[j] > v) {
          values[j + 1] = values[j];
          j--;
        }
        values[j + 1] = v;
      }
      background[i] = values[n >> 1];
    }
  }
  return background;
}
