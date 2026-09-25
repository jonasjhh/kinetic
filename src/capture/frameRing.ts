import type { PassDetection } from "../detection/types";
import type { PassPayload } from "../analysis/types";

interface Slot {
  data: Uint8Array;
  t: number; // µs
  index: number; // capture frame counter, -1 = empty
}

// Fixed-size ring of greyscale frames, allocated once. The most recent
// ~0.5–1s of video is always held, so when a pass is confirmed (a couple
// of frames after the disc has left) every frame of it — plus clean frames
// from just before it — is still available at full resolution.
export class FrameRing {
  readonly width: number;
  readonly height: number;
  private slots: Slot[];

  constructor(width: number, height: number, capacity: number) {
    this.width = width;
    this.height = height;
    this.slots = Array.from({ length: capacity }, () => ({
      data: new Uint8Array(width * height),
      t: 0,
      index: -1,
    }));
  }

  /** The buffer to write frame `index` into; commit() after filling it. */
  slotFor(index: number): Uint8Array {
    return this.slots[index % this.slots.length].data;
  }

  commit(index: number, t: number): void {
    const slot = this.slots[index % this.slots.length];
    slot.index = index;
    slot.t = t;
  }

  get(index: number): { data: Uint8Array; t: number } | null {
    const slot = this.slots[index % this.slots.length];
    return slot.index === index ? slot : null;
  }
}

const BACKGROUND_GAP = 3; // frames skipped right before the pass
const BACKGROUND_FRAMES = 8;

/** Copies the frames of a pass (and a few before it) out of the ring. */
export function buildPassPayload(
  ring: FrameRing,
  detection: PassDetection,
  id: number,
  detScale: number,
  framePeriodUs: number | null,
): PassPayload {
  const frames: PassPayload["frames"] = [];
  for (let i = detection.firstFrame - 1; i <= detection.lastFrame + 1; i++) {
    const f = ring.get(i);
    if (f) frames.push({ t: f.t, frameIndex: i, data: f.data.slice() });
  }
  const backgroundFrames: Uint8Array[] = [];
  const end = detection.firstFrame - BACKGROUND_GAP;
  for (let i = end - BACKGROUND_FRAMES + 1; i <= end; i++) {
    const f = ring.get(i);
    if (f) backgroundFrames.push(f.data.slice());
  }
  return {
    id,
    width: ring.width,
    height: ring.height,
    detScale,
    frames,
    backgroundFrames,
    detection,
    framePeriodUs,
  };
}
