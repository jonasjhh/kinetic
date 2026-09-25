import { fitLine } from "../math/fit";
import { median } from "../vision/image";

// Camera sensors deliver frames on a very regular clock, while the
// timestamps reported alongside them can carry some jitter. When a pass's
// timestamps are consistent with a regular grid (allowing for dropped
// frames), the times are replaced by the least-squares grid t = a + T·n;
// otherwise (variable frame rate) the raw times are kept.
const MAX_GRID_RMS_FRACTION = 0.12;
const MAX_PERIOD_DEVIATION = 0.05;

/** Returns times in seconds relative to the first frame. */
export function regularizeTimestamps(
  timesUs: number[],
  nominalPeriodUs: number | null,
): number[] {
  const raw = timesUs.map((t) => (t - timesUs[0]) / 1e6);
  if (timesUs.length < 3) return raw;

  const diffs: number[] = [];
  for (let i = 1; i < timesUs.length; i++) {
    const d = timesUs[i] - timesUs[i - 1];
    if (d > 0) diffs.push(d);
  }
  const period = nominalPeriodUs ?? median(diffs);
  if (!(period > 0)) return raw;

  const index = timesUs.map((t) => Math.round((t - timesUs[0]) / period));
  for (let i = 1; i < index.length; i++) {
    if (index[i] <= index[i - 1]) return raw;
  }

  const fit = fitLine(index, timesUs);
  if (Math.abs(fit.slope / period - 1) > MAX_PERIOD_DEVIATION) return raw;
  if (fit.rms > MAX_GRID_RMS_FRACTION * period) return raw;

  return index.map((n) => (n * fit.slope) / 1e6);
}
