// Coordinates here are in detection-resolution pixels (see capture worker:
// every stored frame is box-downsampled so its long side is ~320px).

/** One moving blob in one frame that could be (part of) a disc. */
export interface Candidate {
  x: number;
  y: number;
  major: number;
  minor: number;
  count: number;
  border: boolean; // touches the image edge, so only partly visible
}

export interface TrackPoint {
  frame: number; // capture frame counter
  t: number; // seconds
  x: number;
  y: number;
  d: number; // diameter estimate (minor axis, or major axis at the border)
  major: number;
  border: boolean;
}

/** A confirmed disc pass: a straight, disc-sized, disc-fast track. */
export interface PassDetection {
  points: TrackPoint[];
  firstFrame: number;
  lastFrame: number;
  diameterPx: number;
  diametersPerSecond: number;
}
