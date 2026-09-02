const DIAMETER_KEY = "kinetic:discDiameterMm:v1";

// A standard driver is ~211mm across; adjustable in Settings since molds vary.
export const DEFAULT_DISC_DIAMETER_MM = 211;

export function loadDiscDiameterMm(): number {
  const raw = localStorage.getItem(DIAMETER_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_DISC_DIAMETER_MM;
}

export function saveDiscDiameterMm(mm: number): void {
  localStorage.setItem(DIAMETER_KEY, String(mm));
}
