import { useCallback, useEffect, useState } from "react";
import { useCamera } from "../camera/useCamera";
import { PROCESSING_HEIGHT, PROCESSING_WIDTH } from "../detection/constants";
import type { PassEvent } from "../detection/types";
import { useScanner } from "../detection/useScanner";
import { loadCalibration } from "../speed/calibration";
import { computeSpeed } from "../speed/computeSpeed";
import { loadDiscDiameterMm } from "../speed/settings";
import { mpsToKph, mpsToMph } from "../speed/units";

interface ScanResult {
  id: string;
  mph: number;
  kph: number;
  frameCount: number;
}

const PHASE_LABEL: Record<string, string> = {
  armed: "Watching for a throw…",
  capturing: "Tracking…",
  cooldown: "Got it — resetting…",
};

export function ScanScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { videoRef, status, error } = useCamera();
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const calibration = loadCalibration();

  const handleEvent = useCallback((event: PassEvent) => {
    const calibrationNow = loadCalibration();
    if (!calibrationNow) return;
    const discDiameterM = loadDiscDiameterMm() / 1000;
    const speed = computeSpeed(
      event,
      calibrationNow.focalLengthPx,
      discDiameterM,
    );
    if (!speed) return;
    setResults((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        mph: mpsToMph(speed.speedMps),
        kph: mpsToKph(speed.speedMps),
        frameCount: speed.frameCount,
      },
    ]);
  }, []);

  const { phase, debug } = useScanner({
    videoRef,
    active: scanning,
    onEvent: handleEvent,
  });

  const toggleScan = () => {
    setScanning((s) => {
      const next = !s;
      // Starting a fresh session clears prior throws; stopping must leave
      // the list intact so it can actually be read once the phone is
      // picked back up.
      if (next) setResults([]);
      return next;
    });
  };

  // The phone sits face-down and untouched through an entire multi-throw
  // session — without a wake lock, the screen can time out and pause
  // processing partway through, silently breaking the session.
  useEffect(() => {
    if (!scanning || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    navigator.wakeLock
      .request("screen")
      .then((s) => {
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel = s;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void sentinel?.release();
    };
  }, [scanning]);

  return (
    <main style={styles.main}>
      <div style={styles.header}>
        <h1 style={styles.h1}>Kinetic</h1>
        <button style={styles.iconButton} onClick={onOpenSettings}>
          Settings
        </button>
      </div>

      {status === "error" && <p style={styles.error}>{error}</p>}
      {status === "requesting" && (
        <p style={styles.help}>Requesting camera access…</p>
      )}

      {!calibration && (
        <p style={styles.warning}>
          Not calibrated yet — open Settings to calibrate before scanning.
        </p>
      )}

      <div style={styles.frame}>
        <video ref={videoRef} playsInline muted style={styles.video} />
      </div>

      <p style={styles.status}>
        {scanning
          ? PHASE_LABEL[phase]
          : "Ready — place the phone camera-up and press Start."}
      </p>

      {scanning && (
        <p style={styles.debug}>
          motion: {debug.frameSeen ? `${debug.pixelCount}px` : "…"}
        </p>
      )}

      <button
        style={{
          ...styles.primaryButton,
          background: scanning ? "#ff6b6b" : "#38e0c4",
        }}
        onClick={toggleScan}
        disabled={!calibration || status !== "ready"}
      >
        {scanning ? "Stop scan" : "Start scan"}
      </button>

      {results.length > 0 && (
        <div style={styles.resultsList}>
          <h2 style={styles.resultsHeading}>
            {results.length} throw{results.length === 1 ? "" : "s"} recorded
          </h2>
          {results.map((r, i) => (
            <div key={r.id} style={styles.resultRow}>
              <span style={styles.resultIndex}>#{i + 1}</span>
              <span style={styles.resultSpeedRow}>{r.kph.toFixed(1)} km/h</span>
              <span style={styles.resultSubRow}>
                {r.mph.toFixed(1)} mph · {r.frameCount} frames
              </span>
            </div>
          ))}
        </div>
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
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  h1: { margin: 0 },
  iconButton: {
    background: "none",
    border: "1px solid #2a4a44",
    color: "#9fb3ac",
    borderRadius: 999,
    padding: "0.4rem 0.9rem",
    fontSize: "0.85rem",
  },
  error: { color: "#ff6b6b" },
  warning: {
    color: "#f5c065",
    background: "rgba(245, 192, 101, 0.12)",
    borderRadius: 8,
    padding: "0.5rem 0.75rem",
    fontSize: "0.85rem",
  },
  help: { color: "#9fb3ac" },
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
  status: { textAlign: "center", color: "#9fb3ac", margin: "0.75rem 0" },
  debug: {
    textAlign: "center",
    color: "#5c7269",
    fontSize: "0.75rem",
    fontFamily: "monospace",
    margin: "-0.5rem 0 0.75rem",
  },
  primaryButton: {
    width: "100%",
    padding: "0.9rem",
    fontSize: "1.05rem",
    fontWeight: 600,
    borderRadius: 999,
    border: "none",
    color: "#0e1e2a",
  },
  resultsList: {
    marginTop: "1.25rem",
    padding: "0.75rem 1rem",
    borderRadius: 12,
    background: "#12261f",
    maxHeight: "18rem",
    overflowY: "auto",
  },
  resultsHeading: {
    margin: "0.25rem 0 0.75rem",
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#9fb3ac",
    textAlign: "center",
  },
  resultRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "0.6rem",
    padding: "0.5rem 0",
    borderTop: "1px solid #1e3a33",
  },
  resultIndex: { color: "#5c7269", fontSize: "0.85rem", minWidth: "1.75rem" },
  resultSpeedRow: { fontSize: "1.3rem", fontWeight: 700, color: "#38e0c4" },
  resultSubRow: { color: "#9fb3ac", fontSize: "0.85rem" },
};
