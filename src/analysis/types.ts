import type { PassDetection } from "../detection/types";
import type { SpinResult } from "./spin";

export type ThrowType = "rhbh" | "rhfh" | "lhbh" | "lhfh";

/** Everything the analysis needs about one detected pass. */
export interface PassPayload {
  id: number;
  width: number; // stored-frame resolution
  height: number;
  detScale: number; // stored px per detection px
  frames: { t: number; frameIndex: number; data: Uint8Array }[]; // t in µs
  backgroundFrames: Uint8Array[];
  detection: PassDetection; // detection-resolution coordinates
  framePeriodUs: number | null;
}

export interface AnalysisConfig {
  discDiameterM: number;
  // Field of view across the image's long side; gives the focal length,
  // which only affects the (small) vertical speed component.
  fovLongSideDeg: number;
  throwType: ThrowType;
}

export type Confidence = "high" | "medium" | "low";

export interface PassResult {
  ok: true;
  speedMps: number;
  horizontalSpeedMps: number;
  verticalSpeedMps: number;
  launchAngleDeg: number;
  headingDeg: number;
  heightM: number;
  framesUsed: number;
  confidence: Confidence;
  spin: SpinResult | null;
  spinNote: string | null;
}

export interface PassFailure {
  ok: false;
  reason: string;
}

export type PassOutcome = PassResult | PassFailure;

export function expectedSpinSign(throwType: ThrowType): 1 | -1 {
  // Seen from above, a right-hand backhand and a left-hand forehand spin
  // clockwise. Clockwise from above is counter-clockwise in the upward-
  // looking camera image, i.e. a negative rate in image coordinates.
  return throwType === "rhbh" || throwType === "lhfh" ? -1 : 1;
}

export function focalLengthPx(
  width: number,
  height: number,
  fovLongSideDeg: number,
): number {
  const halfFov = (fovLongSideDeg * Math.PI) / 360;
  return Math.max(width, height) / 2 / Math.tan(halfFov);
}
