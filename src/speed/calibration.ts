const STORAGE_KEY = "kinetic:calibration:v1";

export interface Calibration {
  // Camera focal length in processing-canvas pixels (see
  // detection/constants.ts) — the single number the pinhole model needs to
  // turn an apparent pixel size into a real-world distance. Specific to
  // this device's camera and the fixed processing resolution; a different
  // phone (or an app update that changes the processing size) needs a
  // fresh calibration.
  focalLengthPx: number;
}

export function loadCalibration(): Calibration | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Calibration>;
    if (
      typeof parsed.focalLengthPx !== "number" ||
      !(parsed.focalLengthPx > 0)
    ) {
      return null;
    }
    return { focalLengthPx: parsed.focalLengthPx };
  } catch {
    return null;
  }
}

export function saveCalibration(calibration: Calibration): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration));
}

export function clearCalibration(): void {
  localStorage.removeItem(STORAGE_KEY);
}
