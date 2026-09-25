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
const MAX_TRACK_POINTS = 40;
const SIZE_RATIO_MIN = 0.65;
const SIZE_RATIO_MAX = 1.55;
const ACCEPT_SIZE_SPREAD = 1.6;
const ACCEPT_MAX_RMS_DIAMETERS = 0.35;
const ACCEPT_MIN_NET_DIAMETERS = 0.8;

interface Track {
  points: TrackPoint[];
  misses: number;
  diameter: number;
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

  constructor(config: TrackerConfig) {
    this.config = config;
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
        if (velocity) {
          const px = last.x + velocity.vx * dt;
          const py = last.y + velocity.vy * dt;
          const err = Math.hypot(c.x - px, c.y - py);
          const gate = Math.max(
            0.8 * track.diameter,
            0.35 * Math.hypot(velocity.vx, velocity.vy) * dt,
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
      });
    });
    this.tracks = surviving;
    return finished;
  }

  private evaluate(track: Track): PassDetection | null {
    const points = track.points;
    if (points.length < 2) return null;
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

    if (points.length >= 3) {
      const rms = Math.hypot(fx.rms, fy.rms);
      if (rms > ACCEPT_MAX_RMS_DIAMETERS * diameter) return null;
    }

    return {
      points,
      firstFrame: first.frame,
      lastFrame: last.frame,
      diameterPx: diameter,
      diametersPerSecond: dps,
    };
  }
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
