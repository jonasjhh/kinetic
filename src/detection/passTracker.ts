import { fitLine } from "../math/fit";
import { median } from "../vision/image";
import type { Candidate, PassDetection, TrackPoint } from "./types";

export interface TrackerConfig {
  // Plausible disc speeds expressed in disc diameters per second: real
  // speed is v = D · v_px / d_px, so this check needs no camera
  // calibration — only the disc's real diameter.
  minDiametersPerSecond: number;
  maxDiametersPerSecond: number;
}

export function trackerConfigFor(
  discDiameterM: number,
  minSpeedMps = 4,
  maxSpeedMps = 45,
): TrackerConfig {
  return {
    minDiametersPerSecond: minSpeedMps / discDiameterM,
    maxDiametersPerSecond: maxSpeedMps / discDiameterM,
  };
}

const MAX_MISSES = 1;
// A real pass is seen in several frames; two random blobs a plausible
// distance apart are common in a noisy picture, three in a line are not.
const MIN_POINTS = 3;
// Once a track has a velocity, the next blob must land close to where it
// predicts — loose gates let random blobs extend random tracks.
const GATE_DIAMETERS = 0.6;
const GATE_STEP_FRACTION = 0.15;
// A disc flies across the view, so its track comes from an image edge and
// leaves towards one: extrapolated this many frames beyond its first and
// last detection, the line must reach within one diameter of the edge.
const EDGE_EXTRAPOLATION_FRAMES = 1.5;
// ...and its detections cover a good part of its path across the image
// (the chord through the image along the track). Short chains of random
// blobs, fast or slow, don't.
const MIN_CHORD_FRACTION = 0.4;
const MAX_TRACK_POINTS = 40;
const SIZE_RATIO_MIN = 0.65;
const SIZE_RATIO_MAX = 1.55;
// A disc looks the same in every frame of its pass: consistently darker
// (or lighter) than the sky by a similar amount. Random blobs flip sign
// and vary in strength.
const CONTRAST_RATIO_MIN = 0.6;
const CONTRAST_RATIO_MAX = 1 / CONTRAST_RATIO_MIN;
// The disc's width across its motion doesn't change with blur and its
// height barely changes during a pass.
const ACCEPT_SIZE_SPREAD = 1.3;
// A disc against the sky is seen in every frame while it's in view; the
// miss tolerance above is for a single bad frame, not a habit.
const MAX_GAPS_PER_TRACK = 1;
const ACCEPT_MAX_RMS_DIAMETERS = 0.25;
const ACCEPT_MIN_NET_DIAMETERS = 0.8;

interface Track {
  points: TrackPoint[];
  misses: number;
  diameter: number;
  contrast: number;
}

function candidateDiameter(c: Candidate): number {
  // A blob cut off by the image edge has a shrunken minor axis; its
  // longest extent is a better stand-in for the diameter.
  return c.border ? c.major : c.minor;
}

function trackDiameter(points: TrackPoint[]): number {
  const full = points.filter((p) => !p.border).map((p) => p.d);
  if (full.length > 0) return median(full);
  return Math.max(...points.map((p) => p.d));
}

// Links per-frame candidates into tracks with a constant-velocity model and
// reports tracks that look like a disc pass. Every candidate is considered
// — not just the biggest blob — so the thrower's body or arm moving
// elsewhere in view can't hide the disc.
export class PassTracker {
  private tracks: Track[] = [];
  private lastEmittedFrame = -1;
  private config: TrackerConfig;
  private readonly width: number;
  private readonly height: number;

  constructor(config: TrackerConfig, width: number, height: number) {
    this.config = config;
    this.width = width;
    this.height = height;
  }

  setConfig(config: TrackerConfig): void {
    this.config = config;
  }

  reset(): void {
    this.tracks = [];
  }

  update(frame: number, t: number, candidates: Candidate[]): PassDetection[] {
    const pairs: { track: number; candidate: number; cost: number }[] = [];

    this.tracks.forEach((track, ti) => {
      const last = track.points[track.points.length - 1];
      const dt = t - last.t;
      if (dt <= 0) return;
      const velocity = trackVelocity(track.points);

      candidates.forEach((c, ci) => {
        const cd = candidateDiameter(c);
        if (!c.border && !last.border) {
          const ratio = cd / track.diameter;
          if (ratio < SIZE_RATIO_MIN || ratio > SIZE_RATIO_MAX) return;
        }
        const contrastRatio = c.contrast / track.contrast;
        if (
          !(contrastRatio >= CONTRAST_RATIO_MIN) ||
          contrastRatio > CONTRAST_RATIO_MAX
        ) {
          return;
        }
        if (velocity) {
          const px = last.x + velocity.vx * dt;
          const py = last.y + velocity.vy * dt;
          const err = Math.hypot(c.x - px, c.y - py);
          const gate = Math.max(
            GATE_DIAMETERS * track.diameter,
            GATE_STEP_FRACTION * Math.hypot(velocity.vx, velocity.vy) * dt,
          );
          if (err > gate) return;
          pairs.push({ track: ti, candidate: ci, cost: err / gate });
        } else {
          const dist = Math.hypot(c.x - last.x, c.y - last.y);
          const dps = dist / (track.diameter * dt);
          if (
            dps < this.config.minDiametersPerSecond ||
            dps > this.config.maxDiametersPerSecond
          ) {
            return;
          }
          const sizeCost = Math.abs(Math.log(cd / track.diameter));
          pairs.push({ track: ti, candidate: ci, cost: 1 + sizeCost });
        }
      });
    });

    pairs.sort((a, b) => a.cost - b.cost);
    const trackTaken = new Set<number>();
    const candidateTaken = new Set<number>();
    for (const pair of pairs) {
      if (trackTaken.has(pair.track) || candidateTaken.has(pair.candidate))
        continue;
      trackTaken.add(pair.track);
      candidateTaken.add(pair.candidate);
      const track = this.tracks[pair.track];
      track.points.push(toPoint(frame, t, candidates[pair.candidate]));
      track.misses = 0;
      track.diameter = trackDiameter(track.points);
      track.contrast = median(track.points.map((p) => p.contrast));
    }

    const finished: PassDetection[] = [];
    const surviving: Track[] = [];
    this.tracks.forEach((track, ti) => {
      if (!trackTaken.has(ti)) track.misses++;
      const done =
        track.misses > MAX_MISSES || track.points.length >= MAX_TRACK_POINTS;
      if (!done) {
        surviving.push(track);
        return;
      }
      const pass = this.evaluate(track);
      if (pass && pass.firstFrame > this.lastEmittedFrame) {
        this.lastEmittedFrame = pass.lastFrame;
        finished.push(pass);
      }
    });

    candidates.forEach((c, ci) => {
      if (candidateTaken.has(ci)) return;
      surviving.push({
        points: [toPoint(frame, t, c)],
        misses: 0,
        diameter: candidateDiameter(c),
        contrast: c.contrast,
      });
    });
    this.tracks = surviving;
    return finished;
  }

  private nearEdge(x: number, y: number, margin: number): boolean {
    return (
      x < margin ||
      y < margin ||
      x > this.width - 1 - margin ||
      y > this.height - 1 - margin
    );
  }

  /** Length of the line through (x, y) along (dx, dy) inside the image. */
  private chordLength(x: number, y: number, dx: number, dy: number): number {
    let lo = -Infinity;
    let hi = Infinity;
    const clip = (p: number, d: number, max: number) => {
      if (Math.abs(d) < 1e-9) return;
      const a = (0 - p) / d;
      const b = (max - p) / d;
      lo = Math.max(lo, Math.min(a, b));
      hi = Math.min(hi, Math.max(a, b));
    };
    clip(x, dx, this.width - 1);
    clip(y, dy, this.height - 1);
    const len = Math.hypot(dx, dy);
    return hi > lo && Number.isFinite(hi - lo) ? (hi - lo) * len : 0;
  }

  private evaluate(track: Track): PassDetection | null {
    const points = track.points;
    if (points.length < MIN_POINTS) return null;
    const gaps =
      points[points.length - 1].frame - points[0].frame + 1 - points.length;
    if (gaps > MAX_GAPS_PER_TRACK) return null;
    const full = points.filter((p) => !p.border);
    if (full.length === 0) return null;

    const sizes = full.map((p) => p.d);
    if (Math.max(...sizes) / Math.min(...sizes) > ACCEPT_SIZE_SPREAD)
      return null;
    const diameter = median(sizes);

    const t = points.map((p) => p.t);
    const fx = fitLine(
      t,
      points.map((p) => p.x),
    );
    const fy = fitLine(
      t,
      points.map((p) => p.y),
    );
    const dps = Math.hypot(fx.slope, fy.slope) / diameter;
    if (
      dps < this.config.minDiametersPerSecond ||
      dps > this.config.maxDiametersPerSecond
    ) {
      return null;
    }

    const first = points[0];
    const last = points[points.length - 1];
    const net = Math.hypot(last.x - first.x, last.y - first.y);
    if (net < ACCEPT_MIN_NET_DIAMETERS * diameter) return null;

    const rms = Math.hypot(fx.rms, fy.rms);
    if (rms > ACCEPT_MAX_RMS_DIAMETERS * diameter) return null;

    const frameDt = minPositiveStep(t);
    const reachesEdge = (time: number) =>
      this.nearEdge(
        fx.intercept + fx.slope * time,
        fy.intercept + fy.slope * time,
        diameter,
      );
    const entered =
      first.border ||
      reachesEdge(first.t - EDGE_EXTRAPOLATION_FRAMES * frameDt);
    const left =
      last.border || reachesEdge(last.t + EDGE_EXTRAPOLATION_FRAMES * frameDt);
    if (!entered || !left) return null;

    const chord = this.chordLength(
      (first.x + last.x) / 2,
      (first.y + last.y) / 2,
      fx.slope,
      fy.slope,
    );
    if (net < MIN_CHORD_FRACTION * chord) return null;

    return {
      points,
      firstFrame: first.frame,
      lastFrame: last.frame,
      diameterPx: diameter,
      diametersPerSecond: dps,
    };
  }
}

function minPositiveStep(t: number[]): number {
  let step = Infinity;
  for (let i = 1; i < t.length; i++) {
    const d = t[i] - t[i - 1];
    if (d > 0 && d < step) step = d;
  }
  return Number.isFinite(step) ? step : 0;
}

function toPoint(frame: number, t: number, c: Candidate): TrackPoint {
  return {
    frame,
    t,
    x: c.x,
    y: c.y,
    d: candidateDiameter(c),
    major: c.major,
    border: c.border,
    contrast: c.contrast,
  };
}

function trackVelocity(
  points: TrackPoint[],
): { vx: number; vy: number } | null {
  if (points.length < 2) return null;
  const recent = points.slice(-4);
  const t = recent.map((p) => p.t);
  return {
    vx: fitLine(
      t,
      recent.map((p) => p.x),
    ).slope,
    vy: fitLine(
      t,
      recent.map((p) => p.y),
    ).slope,
  };
}
