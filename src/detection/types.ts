// One frame's motion measurement, in processing-canvas pixel coordinates
// (see constants.ts) — describing the single largest connected blob of
// motion that frame, not the union of everything that moved.
export interface FrameSample {
  t: number; // performance.now() at capture, ms
  cx: number; // blob centroid x
  cy: number; // blob centroid y
  width: number; // axis-aligned bounding-box width of the blob
  height: number; // axis-aligned bounding-box height of the blob
  pixelCount: number; // how many pixels make up the blob — its "mass"
  majorAxisPx: number; // ellipse-fitted major axis — tilt-invariant diameter estimate
}

export interface PassEvent {
  frames: FrameSample[];
}
