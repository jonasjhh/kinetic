import type { ControlStatus, ControlSupport } from "../camera/cameraControls";
import type { CaptureHealth, MarkerCheck } from "../capture/messages";
import type { DeviceTilt } from "../device/useDeviceTilt";
import { colors, pillButton } from "../ui/theme";

type Level = "good" | "warn" | "bad" | "pending";

interface Check {
  label: string;
  level: Level;
  detail: string;
}

const MARKER_VISIBLE_SCORE = 4;

// The automatic checks shown before (and during) a scan, each with a
// one-line fix when it isn't green.
export function SetupChecks({
  health,
  support,
  controls,
  tilt,
  wakeLockSupported,
  standalone,
  marker,
  markerChecking,
  onToggleMarkerCheck,
}: {
  health: CaptureHealth | null;
  support: ControlSupport | null;
  controls: ControlStatus | null;
  tilt: DeviceTilt | null;
  wakeLockSupported: boolean;
  standalone: boolean;
  marker: MarkerCheck | null;
  markerChecking: boolean;
  onToggleMarkerCheck: () => void;
}) {
  const checks: Check[] = [];

  if (!health) {
    checks.push({ label: "Camera", level: "pending", detail: "Starting…" });
  } else {
    const fps = Math.round(health.fps);
    checks.push({
      label: "Frame rate",
      level: fps >= 50 ? "good" : fps >= 25 ? "warn" : "bad",
      detail:
        fps >= 50
          ? `${fps} fps at ${health.width}×${health.height}`
          : `${fps} fps — spin needs the throw-type setting to be right, and fast throws get fewer frames.`,
    });
    const dropRatio =
      health.droppedFrames /
      Math.max(1, health.totalFrames + health.droppedFrames);
    checks.push({
      label: "Continuous capture",
      level: dropRatio < 0.01 ? "good" : dropRatio < 0.05 ? "warn" : "bad",
      detail:
        dropRatio < 0.01
          ? `No gaps (${health.processingMs.toFixed(1)} ms/frame)`
          : `${health.droppedFrames} frames dropped — close other apps; the phone may be overheating.`,
    });
  }

  if (controls) {
    const locked = [
      controls.focus === "locked" && "focus",
      controls.exposure === "locked" &&
        `exposure ${controls.exposureTimeMs?.toFixed(1)} ms`,
      controls.whiteBalance === "locked" && "white balance",
    ].filter(Boolean);
    checks.push({
      label: "Camera controls",
      level: controls.exposure === "locked" ? "good" : "warn",
      detail: locked.length
        ? `Locked: ${locked.join(", ")}`
        : "Automatic — fast throws will be blurrier.",
    });
  } else if (support) {
    checks.push({
      label: "Camera controls",
      level: support.exposure ? "good" : "warn",
      detail: support.exposure
        ? "Exposure and focus will be locked when you start."
        : "This phone doesn't allow manual exposure — fast throws will be blurrier.",
    });
  }

  checks.push(
    tilt
      ? {
          label: "Level",
          level: !tilt.cameraUp
            ? "pending"
            : tilt.tiltDeg <= 8
              ? "good"
              : "warn",
          detail: !tilt.cameraUp
            ? "Checked once the phone lies camera-up."
            : `Tilted ${tilt.tiltDeg.toFixed(0)}°${tilt.tiltDeg > 8 ? " — find a flatter spot." : ""}`,
        }
      : {
          label: "Level",
          level: "warn",
          detail: "No motion sensor — make sure the phone lies flat.",
        },
  );

  checks.push({
    label: "Screen stays on",
    level: wakeLockSupported ? "good" : "warn",
    detail: wakeLockSupported
      ? "Kept awake while scanning."
      : "Not supported — set a long screen timeout.",
  });

  checks.push({
    label: "Screen rotation",
    level: standalone ? "good" : "warn",
    detail: standalone
      ? "Locked to portrait."
      : "Install the app (browser menu → Add to Home screen) to lock rotation.",
  });

  const markerSeen = !!marker && marker.markerScore >= MARKER_VISIBLE_SCORE;
  checks.push({
    label: "Spin marker",
    level: markerChecking
      ? markerSeen
        ? "good"
        : "pending"
      : markerSeen
        ? "good"
        : "warn",
    detail: markerChecking
      ? markerSeen
        ? "Marker visible — spin will be measured."
        : "Hold the disc, underside to the camera, filling the dashed circle."
      : markerSeen
        ? "Marker visible."
        : "Not checked. Without a tape strip only speed is measured.",
  });

  return (
    <div style={styles.list}>
      {checks.map((c) => (
        <div key={c.label} style={styles.row}>
          <span style={{ ...styles.dot, background: dotColor(c.level) }} />
          <div style={styles.text}>
            <div style={styles.label}>{c.label}</div>
            <div style={styles.detail}>{c.detail}</div>
          </div>
          {c.label === "Spin marker" && (
            <button style={pillButton} onClick={onToggleMarkerCheck}>
              {markerChecking ? "Done" : "Check"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function dotColor(level: Level): string {
  switch (level) {
    case "good":
      return colors.accent;
    case "warn":
      return colors.warn;
    case "bad":
      return colors.bad;
    default:
      return colors.faint;
  }
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    marginTop: "1rem",
    padding: "0.5rem 0.75rem",
    borderRadius: 12,
    background: colors.panel,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.45rem 0",
  },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  text: { flex: 1, minWidth: 0 },
  label: { fontSize: "0.9rem" },
  detail: { fontSize: "0.78rem", color: colors.muted, lineHeight: 1.35 },
};
