import type { PassResult } from "../analysis/types";
import type { SpeedUnit } from "../settings/settings";
import { mpsToKph, mpsToMph } from "../settings/units";

export function formatSpeed(mps: number, unit: SpeedUnit): string {
  return unit === "mph"
    ? `${mpsToMph(mps).toFixed(1)} mph`
    : `${mpsToKph(mps).toFixed(1)} km/h`;
}

export function roundRpm(rpm: number): number {
  return Math.round(rpm / 10) * 10;
}

export function spokenResult(result: PassResult, unit: SpeedUnit): string {
  const speed =
    unit === "mph"
      ? `${Math.round(mpsToMph(result.speedMps))} miles per hour`
      : `${Math.round(mpsToKph(result.speedMps))} kilometres per hour`;
  return result.spin
    ? `${speed}. ${roundRpm(result.spin.rpm)} R P M.`
    : `${speed}.`;
}
