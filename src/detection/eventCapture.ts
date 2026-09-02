import type { FrameSample, PassEvent } from "./types";

// Require more motion "mass" to start an event than to continue one — a
// disc filling more of the frame as it crosses overhead should trigger
// reliably, while small incidental motion (hand withdrawing, wind in
// grass) shouldn't arm a capture.
const TRIGGER_MIN_PIXELS = 90;
const MAX_MISSED_FRAMES = 2; // tolerate brief gaps mid-event

// A generous safety cap, not the expected pass duration — a genuine pass
// should end because motion stopped (missedFrames above), not because the
// clock ran out. A tight cap here truncates slower throws mid-flight,
// feeding a shortened, asymmetric span into the speed math.
const MAX_EVENT_DURATION_MS = 1500;

const MIN_EVENT_FRAMES = 3; // need at least this many samples for a speed
// Debounces the trailing motion of the throw that just finished (follow-
// through, disturbed grass, camera micro-shake) so it can't immediately
// re-trigger a bogus second event — that noise settles in well under
// 150ms. This is not meant to space out separate throws (those are
// seconds apart in practice), so it's kept short to avoid dropping a
// fast second throw.
const COOLDOWN_MS = 150;

// Frames seen below the trigger threshold, while still armed, are the
// disc's real entry — it starts small/far and only grows past
// TRIGGER_MIN_PIXELS a frame or two in. Buffering a couple of them lets a
// trigger reach back and recover that otherwise-lost entry data.
const PRE_ROLL_SIZE = 2;
const PRE_ROLL_MAX_AGE_MS = 200;

// A disc flying in a straight line covers roughly as much net ground as
// the total path its tracked centroid wanders; a hand or background
// clutter tends to wobble in place, covering much more path than net
// displacement. straightness = netDisplacement / pathLength.
const MIN_STRAIGHTNESS = 0.6;
const MIN_NET_DISPLACEMENT_PX = 8;

export type ScanPhase = "armed" | "capturing" | "cooldown";

// State machine that turns a stream of per-frame motion samples into
// discrete "something flew over the camera" events.
export class EventCapture {
  private phaseValue: ScanPhase = "armed";
  private frames: FrameSample[] = [];
  private missedFrames = 0;
  private cooldownUntil = 0;
  private preRoll: FrameSample[] = [];

  get phase(): ScanPhase {
    return this.phaseValue;
  }

  /** Feed one frame's sample (or null). Returns a finished event once one completes. */
  update(sample: FrameSample | null, now: number): PassEvent | null {
    if (this.phaseValue === "cooldown") {
      if (now < this.cooldownUntil) return null;
      this.phaseValue = "armed";
    }

    if (this.phaseValue === "armed") {
      if (sample && sample.pixelCount >= TRIGGER_MIN_PIXELS) {
        this.phaseValue = "capturing";
        const recentPreRoll = this.preRoll.filter(
          (f) => now - f.t <= PRE_ROLL_MAX_AGE_MS,
        );
        this.frames = [...recentPreRoll, sample];
        this.missedFrames = 0;
        this.preRoll = [];
      } else if (sample) {
        this.preRoll.push(sample);
        if (this.preRoll.length > PRE_ROLL_SIZE) this.preRoll.shift();
      }
      return null;
    }

    // capturing
    if (sample) {
      this.frames.push(sample);
      this.missedFrames = 0;
    } else {
      this.missedFrames++;
    }

    const elapsed = now - this.frames[0].t;
    const shouldEnd =
      this.missedFrames > MAX_MISSED_FRAMES || elapsed > MAX_EVENT_DURATION_MS;
    if (!shouldEnd) return null;

    const finishedFrames = this.frames;
    this.frames = [];
    this.phaseValue = "cooldown";
    this.cooldownUntil = now + COOLDOWN_MS;

    if (finishedFrames.length < MIN_EVENT_FRAMES) return null;
    if (!looksLikeAStraightPass(finishedFrames)) return null;
    return { frames: finishedFrames };
  }

  reset() {
    this.phaseValue = "armed";
    this.frames = [];
    this.missedFrames = 0;
    this.preRoll = [];
  }
}

function looksLikeAStraightPass(frames: FrameSample[]): boolean {
  let pathLength = 0;
  for (let i = 1; i < frames.length; i++) {
    const dx = frames[i].cx - frames[i - 1].cx;
    const dy = frames[i].cy - frames[i - 1].cy;
    pathLength += Math.hypot(dx, dy);
  }

  const first = frames[0];
  const last = frames[frames.length - 1];
  const netDisplacement = Math.hypot(last.cx - first.cx, last.cy - first.cy);

  if (netDisplacement < MIN_NET_DISPLACEMENT_PX) return false;
  if (pathLength === 0) return false;
  return netDisplacement / pathLength >= MIN_STRAIGHTNESS;
}
