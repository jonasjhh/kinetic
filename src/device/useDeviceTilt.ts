import { useEffect, useState } from "react";

export interface DeviceTilt {
  tiltDeg: number; // angle between the camera axis and vertical
  cameraUp: boolean; // rear camera facing the sky (screen facing down)
}

const SMOOTHING = 0.2;
const UPDATE_INTERVAL_MS = 200;

// From the gravity vector: lying flat, |z| carries all of g. Android
// reports z ≈ +9.8 with the screen facing up, so the rear camera faces the
// sky when z is negative.
export function useDeviceTilt(): DeviceTilt | null {
  const [tilt, setTilt] = useState<DeviceTilt | null>(null);

  useEffect(() => {
    let gx = 0;
    let gy = 0;
    let gz = 0;
    let initialised = false;
    let lastUpdate = 0;

    const onMotion = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x === null || g.y === null || g.z === null) return;
      if (!initialised) {
        [gx, gy, gz] = [g.x, g.y, g.z];
        initialised = true;
      } else {
        gx += (g.x - gx) * SMOOTHING;
        gy += (g.y - gy) * SMOOTHING;
        gz += (g.z - gz) * SMOOTHING;
      }
      const now = performance.now();
      if (now - lastUpdate < UPDATE_INTERVAL_MS) return;
      lastUpdate = now;
      const magnitude = Math.hypot(gx, gy, gz);
      if (magnitude < 1) return;
      setTilt({
        tiltDeg:
          (Math.acos(Math.min(1, Math.abs(gz) / magnitude)) * 180) / Math.PI,
        cameraUp: gz < 0,
      });
    };

    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, []);

  return tilt;
}
