import { useCallback, useState } from "react";
import type { ThrowType } from "../analysis/types";

export type SpeedUnit = "kmh" | "mph";

export interface Settings {
  discDiameterMm: number;
  throwType: ThrowType;
  speedUnit: SpeedUnit;
  voice: boolean;
  // Camera field of view across the image's long side. Only affects the
  // vertical-speed component; a typical phone main camera is ~65–72°.
  fovLongSideDeg: number;
  setupGuideSeen: boolean;
}

// A standard driver is ~211mm across.
export const DEFAULT_SETTINGS: Settings = {
  discDiameterMm: 211,
  throwType: "rhbh",
  speedUnit: "kmh",
  voice: true,
  fovLongSideDeg: 69,
  setupGuideSeen: false,
};

const STORAGE_KEY = "kinetic:settings:v2";
// The disc diameter used to live under its own key.
const LEGACY_DIAMETER_KEY = "kinetic:discDiameterMm:v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    }
    const legacy = Number(localStorage.getItem(LEGACY_DIAMETER_KEY));
    if (Number.isFinite(legacy) && legacy > 0) {
      return { ...DEFAULT_SETTINGS, discDiameterMm: legacy };
    }
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not persisted; the in-memory value still applies this session.
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  return { settings, update };
}

export const THROW_TYPE_LABEL: Record<ThrowType, string> = {
  rhbh: "Right-hand backhand",
  rhfh: "Right-hand forehand",
  lhbh: "Left-hand backhand",
  lhfh: "Left-hand forehand",
};
