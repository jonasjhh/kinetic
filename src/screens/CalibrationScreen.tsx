import { useEffect, useState } from "react";
import { useCamera } from "../camera/useCamera";
import { PROCESSING_HEIGHT, PROCESSING_WIDTH } from "../detection/constants";
import { FrameAnalyzer } from "../detection/frameAnalyzer";
import type { FrameSample } from "../detection/types";
import { saveCalibration } from "../speed/calibration";
import { loadDiscDiameterMm } from "../speed/settings";

// How many recent blob-size measurements to keep for the stability check.
const WINDOW_SIZE = 8;
// (max - min) / average across the window must be within this fraction to
// count as "steady" — a moving/wobbling disc will exceed it.
const STABILITY_TOLERANCE = 0.1;
// Tolerate a few dropped frames (motion blur, a brief detector miss)
// before giving up and starting the window over.
const MAX_CONSECUTIVE_MISSES = 5;
const UI_UPDATE_INTERVAL_MS = 100;

interface Reading {
  sample: FrameSample;
  averageMajorAxisPx: number;
  stable: boolean;
}

export function CalibrationScreen({ onDone }: { onDone: () => void }) {
  const { videoRef, status, error } = useCamera();
  const [distanceCm, setDistanceCm] = useState("100");
  const [reading, setReading] = useState<Reading | null>(null);
  const [savedFocalLength, setSavedFocalLength] = useState<number | null>(null);

  // Continuously watches the live feed with the same motion detector the
  // live scanner uses. Moving the disc into frame is exactly the motion
  // signal it's built to catch — and once it's there, the detector's
  // background model never re-absorbs it (see frameAnalyzer.ts), so
  // holding the disc still keeps it tracked instead of making it
  // disappear. No manual tracing needed.
  useEffect(() => {
    if (status !== "ready") return;

    const analyzer = new FrameAnalyzer();
    const readingsWindow: number[] = [];
    let misses = 0;
    let lastUiUpdate = 0;
    let frameId: number;

    const tick = () => {
      const video = videoRef.current;
      if (video) {
        const now = performance.now();
        const sample = analyzer.sample(video, now);

        if (sample) {
          misses = 0;
          readingsWindow.push(sample.majorAxisPx);
          if (readingsWindow.length > WINDOW_SIZE) readingsWindow.shift();
        } else if (++misses > MAX_CONSECUTIVE_MISSES) {
          readingsWindow.length = 0;
        }

        if (now - lastUiUpdate > UI_UPDATE_INTERVAL_MS) {
          lastUiUpdate = now;
          if (!sample || readingsWindow.length === 0) {
            setReading(null);
          } else {
            const average =
              readingsWindow.reduce((a, b) => a + b, 0) / readingsWindow.length;
            const max = Math.max(...readingsWindow);
            const min = Math.min(...readingsWindow);
            const stable =
              readingsWindow.length === WINDOW_SIZE &&
              (max - min) / average <= STABILITY_TOLERANCE;
            setReading({ sample, averageMajorAxisPx: average, stable });
          }
        }
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [status, videoRef]);

  const distanceM = Number(distanceCm) / 100;
  const discDiameterMm = loadDiscDiameterMm();
  const discDiameterM = discDiameterMm / 1000;
  const canSave = !!reading?.stable && distanceM > 0;

  const save = () => {
    if (!reading || !canSave) return;
    const focalLengthPx =
      (reading.averageMajorAxisPx * distanceM) / discDiameterM;
    saveCalibration({ focalLengthPx });
    setSavedFocalLength(focalLengthPx);
  };

  const overlayStyle = reading
    ? {
        left: `${((reading.sample.cx - reading.sample.width / 2) / PROCESSING_WIDTH) * 100}%`,
        top: `${((reading.sample.cy - reading.sample.height / 2) / PROCESSING_HEIGHT) * 100}%`,
        width: `${(reading.sample.width / PROCESSING_WIDTH) * 100}%`,
        height: `${(reading.sample.height / PROCESSING_HEIGHT) * 100}%`,
        borderColor: reading.stable ? "#38e0c4" : "#f5c065",
        background: reading.stable
          ? "rgba(56, 224, 196, 0.2)"
          : "rgba(245, 192, 101, 0.15)",
      }
    : null;

  const statusText = !reading
    ? "No disc detected — move it into view"
    : reading.stable
      ? `Locked on — ${reading.averageMajorAxisPx.toFixed(0)}px across`
      : `Detecting… ${reading.averageMajorAxisPx.toFixed(0)}px, hold it steady`;

  return (
    <main style={styles.main}>
      <button style={styles.backButton} onClick={onDone}>
        ← Back
      </button>
      <h1 style={styles.h1}>Calibrate camera</h1>
      <p style={styles.help}>
        Hold the disc flat, facing the camera, at a distance you can measure
        (e.g. a tape measure or a fixed mark). Enter that distance, then hold
        the disc steady in view — once it locks on, tap "Use this measurement."
      </p>

      {status === "error" && <p style={styles.error}>{error}</p>}

      <label style={styles.label}>
        Distance from camera to disc (cm)
        <input
          style={styles.input}
          type="number"
          inputMode="decimal"
          min={1}
          value={distanceCm}
          onChange={(e) => setDistanceCm(e.target.value)}
        />
      </label>
      <p style={styles.help}>
        Using disc diameter: {discDiameterMm}mm (change in Settings).
      </p>

      <div style={styles.frame}>
        <video ref={videoRef} playsInline muted style={styles.video} />
        {overlayStyle && <div style={{ ...styles.box, ...overlayStyle }} />}
      </div>

      <p
        style={{
          ...styles.status,
          color: reading?.stable ? "#38e0c4" : "#9fb3ac",
        }}
      >
        {statusText}
      </p>

      <button style={styles.primaryButton} onClick={save} disabled={!canSave}>
        Use this measurement
      </button>

      {savedFocalLength !== null && (
        <p style={styles.success}>
          Saved — focal length: {savedFocalLength.toFixed(1)}px. You can go back
          and start scanning.
        </p>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    fontFamily: "sans-serif",
    padding: "1.5rem",
    color: "#e8f0ee",
    maxWidth: 480,
    margin: "0 auto",
  },
  backButton: {
    background: "none",
    border: "none",
    color: "#38e0c4",
    fontSize: "1rem",
    padding: 0,
    marginBottom: "0.5rem",
  },
  h1: { margin: "0 0 0.5rem" },
  help: { color: "#9fb3ac", fontSize: "0.9rem", lineHeight: 1.4 },
  error: { color: "#ff6b6b" },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    margin: "1rem 0 0.25rem",
    fontSize: "0.9rem",
  },
  input: {
    fontSize: "1.1rem",
    padding: "0.5rem",
    borderRadius: 8,
    border: "1px solid #2a4a44",
    background: "#0e1e2a",
    color: "#e8f0ee",
  },
  frame: {
    position: "relative",
    width: "100%",
    aspectRatio: `${PROCESSING_WIDTH} / ${PROCESSING_HEIGHT}`,
    background: "#000",
    borderRadius: 8,
    overflow: "hidden",
    marginTop: "0.75rem",
  },
  video: { width: "100%", height: "100%", objectFit: "cover" },
  box: {
    position: "absolute",
    border: "2px solid",
    pointerEvents: "none",
    transition: "left 0.1s, top 0.1s, width 0.1s, height 0.1s",
  },
  status: { textAlign: "center", margin: "0.75rem 0" },
  primaryButton: {
    width: "100%",
    padding: "0.9rem",
    fontSize: "1.05rem",
    fontWeight: 600,
    borderRadius: 999,
    border: "none",
    background: "#38e0c4",
    color: "#0e1e2a",
  },
  success: { color: "#38e0c4", marginTop: "1rem" },
};
