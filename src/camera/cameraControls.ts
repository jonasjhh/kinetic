// Manual focus / exposure / white balance through the Image Capture
// constraint extensions Chrome on Android exposes on camera tracks. Every
// control is feature-detected: phones without it keep automatic control,
// and the setup check says so.

interface Range {
  min: number;
  max: number;
  step?: number;
}

type ExtendedCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  focusDistance?: Range;
  exposureMode?: string[];
  exposureTime?: Range; // units of 100 µs, per the Image Capture spec
  whiteBalanceMode?: string[];
  colorTemperature?: Range;
  iso?: Range;
};

type ExtendedSettings = MediaTrackSettings & {
  iso?: number;
};

export type ControlState = "locked" | "auto" | "unsupported";

export interface ControlStatus {
  focus: ControlState;
  exposure: ControlState;
  whiteBalance: ControlState;
  exposureTimeMs: number | null;
}

export interface ControlSupport {
  focus: boolean;
  exposure: boolean;
  whiteBalance: boolean;
}

// Discs pass ~1.5–3m above the phone.
const FOCUS_DISTANCE_M = 2.5;
const DAYLIGHT_KELVIN = 5500;
// Short exposure freezes the disc (and its marker): at 30 m/s, 1 ms is
// 3 cm of blur. Brighter is traded for sharper up to MAX.
const START_EXPOSURE = 10; // 1 ms
const MAX_EXPOSURE = 40; // 4 ms
const TARGET_LUMA = 110;
const LUMA_TOLERANCE = 25;
const TOO_DARK_LUMA = 45;
const SETTLE_MS = 350;
const MAX_ITERATIONS = 6;

function capabilities(track: MediaStreamTrack): ExtendedCapabilities {
  return typeof track.getCapabilities === "function"
    ? (track.getCapabilities() as ExtendedCapabilities)
    : {};
}

export function controlSupport(track: MediaStreamTrack): ControlSupport {
  const caps = capabilities(track);
  return {
    focus:
      !!caps.focusMode?.includes("manual") &&
      !!caps.focusDistance &&
      caps.focusDistance.max >= 1,
    exposure: !!caps.exposureMode?.includes("manual") && !!caps.exposureTime,
    whiteBalance:
      !!caps.whiteBalanceMode?.includes("manual") && !!caps.colorTemperature,
  };
}

async function apply(
  track: MediaStreamTrack,
  constraints: Record<string, unknown>,
): Promise<boolean> {
  try {
    await track.applyConstraints({
      advanced: [constraints as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    return false;
  }
}

const clamp = (v: number, r: Range) => Math.min(r.max, Math.max(r.min, v));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Locks focus and white balance, then searches for the shortest exposure
 * that still gives a usable image, using the live mean brightness.
 */
export async function lockForScanning(
  track: MediaStreamTrack,
  measureBrightness: () => Promise<number>, // NaN when unavailable
): Promise<ControlStatus> {
  const caps = capabilities(track);
  const support = controlSupport(track);
  const status: ControlStatus = {
    focus: "unsupported",
    exposure: "unsupported",
    whiteBalance: "unsupported",
    exposureTimeMs: null,
  };

  if (support.focus && caps.focusDistance) {
    status.focus = (await apply(track, {
      focusMode: "manual",
      focusDistance: clamp(FOCUS_DISTANCE_M, caps.focusDistance),
    }))
      ? "locked"
      : "auto";
  }

  if (support.whiteBalance && caps.colorTemperature) {
    status.whiteBalance = (await apply(track, {
      whiteBalanceMode: "manual",
      colorTemperature: clamp(DAYLIGHT_KELVIN, caps.colorTemperature),
    }))
      ? "locked"
      : "auto";
  }

  if (support.exposure && caps.exposureTime) {
    const range = caps.exposureTime;
    const maxTime = Math.min(MAX_EXPOSURE, range.max);
    let time = clamp(START_EXPOSURE, range);
    let iso = (track.getSettings() as ExtendedSettings).iso ?? null;
    let brightness = 0;
    let ok = await apply(track, { exposureMode: "manual", exposureTime: time });

    for (let i = 0; ok && i < MAX_ITERATIONS; i++) {
      await wait(SETTLE_MS);
      brightness = await measureBrightness();
      if (!Number.isFinite(brightness)) {
        ok = false; // no frames to judge by; fall back to auto exposure
        break;
      }
      if (Math.abs(brightness - TARGET_LUMA) < LUMA_TOLERANCE) break;
      const scale = Math.min(
        2.5,
        Math.max(0.4, TARGET_LUMA / Math.max(brightness, 1)),
      );
      const nextTime = Math.min(maxTime, Math.max(range.min, time * scale));
      if (nextTime !== time) {
        time = nextTime;
        ok = await apply(track, { exposureMode: "manual", exposureTime: time });
      } else if (caps.iso && iso !== null && scale > 1 && iso < caps.iso.max) {
        // Exposure is at its cap; raise sensor gain instead.
        iso = clamp(iso * scale, caps.iso);
        ok = await apply(track, {
          exposureMode: "manual",
          exposureTime: time,
          iso,
        });
      } else {
        break;
      }
    }

    if (ok && brightness >= TOO_DARK_LUMA) {
      status.exposure = "locked";
      status.exposureTimeMs = time / 10;
    } else {
      await apply(track, { exposureMode: "continuous" });
      status.exposure = "auto";
    }
  }

  return status;
}

export async function unlockControls(track: MediaStreamTrack): Promise<void> {
  const caps = capabilities(track);
  if (caps.exposureMode?.includes("continuous"))
    await apply(track, { exposureMode: "continuous" });
  if (caps.focusMode?.includes("continuous"))
    await apply(track, { focusMode: "continuous" });
  if (caps.whiteBalanceMode?.includes("continuous"))
    await apply(track, { whiteBalanceMode: "continuous" });
}
