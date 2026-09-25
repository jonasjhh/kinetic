import { useCallback, useEffect, useMemo, useState } from "react";
import { controlSupport } from "../camera/cameraControls";
import { useCamera } from "../camera/useCamera";
import type { MarkerCheck } from "../capture/messages";
import { CameraView } from "../components/CameraView";
import { SetupChecks } from "../components/SetupChecks";
import { ThrowList } from "../components/ThrowList";
import { useDeviceTilt } from "../device/useDeviceTilt";
import { useScanSession, type ScanPhase } from "../scan/useScanSession";
import type { Settings } from "../settings/settings";
import { colors, help, page, pillButton, primaryButton } from "../ui/theme";

const MARKER_POLL_MS = 300;

const PHASE_TEXT: Record<ScanPhase, string> = {
  idle: "Ready to start. Follow the setup guide if this is your first time.",
  countdown: "Place the phone camera-up…",
  locking: "Locking camera focus and exposure…",
  warming: "Learning the background — keep still…",
  ready: "Watching for throws. Results are spoken aloud.",
};

export function ScanScreen({
  settings,
  onOpenSettings,
  onOpenGuide,
}: {
  settings: Settings;
  onOpenSettings: () => void;
  onOpenGuide: () => void;
}) {
  const camera = useCamera();
  const tilt = useDeviceTilt();
  const session = useScanSession({
    track: camera.track,
    videoRef: camera.videoRef,
    settings,
    tilt,
  });
  const { pipeline, phase } = session;
  const scanning = phase !== "idle";

  const [markerChecking, setMarkerChecking] = useState(false);
  const [marker, setMarker] = useState<MarkerCheck | null>(null);

  const support = useMemo(
    () => (camera.track ? controlSupport(camera.track) : null),
    [camera.track],
  );
  const standalone = useMemo(
    () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches,
    [],
  );

  // Show detected blobs on the preview whenever it can be seen.
  const { setOverlay, checkMarker } = pipeline;
  useEffect(() => {
    if (!camera.track) return;
    setOverlay(!scanning);
  }, [camera.track, scanning, setOverlay]);

  useEffect(() => {
    if (!markerChecking) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        const result = await checkMarker();
        if (cancelled) return;
        setMarker((prev) =>
          prev && prev.markerScore >= 4 && result.markerScore < 4
            ? prev
            : result,
        );
        await new Promise((r) => setTimeout(r, MARKER_POLL_MS));
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [markerChecking, checkMarker]);

  const saveLastPass = useCallback(async () => {
    const buffer = await pipeline.exportLastPass();
    if (!buffer) return;
    const url = URL.createObjectURL(new Blob([buffer]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `kinetic-pass-${new Date().toISOString().replace(/[:.]/g, "-")}.kinetic`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [pipeline]);

  const toggleScan = () => {
    if (scanning) {
      session.stop();
    } else {
      setMarkerChecking(false);
      void session.start();
    }
  };

  return (
    <main style={page}>
      <div style={styles.header}>
        <h1 style={styles.h1}>Kinetic</h1>
        <div style={styles.headerButtons}>
          <button style={pillButton} onClick={onOpenGuide}>
            Guide
          </button>
          <button
            style={pillButton}
            onClick={onOpenSettings}
            disabled={scanning}
          >
            Settings
          </button>
        </div>
      </div>

      {camera.status === "error" && <p style={styles.error}>{camera.error}</p>}
      {pipeline.error && (
        <p style={styles.error}>Capture error: {pipeline.error}</p>
      )}

      <CameraView
        videoRef={camera.videoRef}
        aspect={pipeline.health ?? camera.settings}
        blobs={pipeline.overlay}
        showMarkerGuide={markerChecking}
      />

      <p style={styles.status}>
        {phase === "countdown"
          ? `${PHASE_TEXT.countdown} ${session.countdown}`
          : PHASE_TEXT[phase]}
      </p>

      <button
        style={{
          ...primaryButton,
          background: scanning ? colors.bad : colors.accent,
        }}
        onClick={toggleScan}
        disabled={camera.status !== "ready"}
      >
        {scanning ? "Stop" : "Start"}
      </button>

      <ThrowList
        throws={session.throws}
        formatSpeed={session.formatSpeed}
        onSaveLast={() => void saveLastPass()}
      />

      <SetupChecks
        health={pipeline.health}
        support={support}
        controls={session.controls}
        tilt={tilt}
        wakeLockSupported={"wakeLock" in navigator}
        standalone={standalone}
        marker={marker}
        markerChecking={markerChecking}
        onToggleMarkerCheck={() => {
          setMarker(null);
          setMarkerChecking((v) => !v);
        }}
      />
      {!scanning && (
        <p style={help}>
          Wave a disc over the camera — a circle marks each moving object the
          detector sees.
        </p>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerButtons: { display: "flex", gap: "0.5rem" },
  h1: { margin: 0 },
  error: { color: colors.bad },
  status: { textAlign: "center", color: colors.muted, margin: "0.75rem 0" },
};
