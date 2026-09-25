import { MARKER_GUIDE_RADIUS } from "../capture/markerGuide";
import type { OverlayBlob } from "../capture/messages";
import { colors } from "../ui/theme";

const MAX_HEIGHT_VH = 42;

// Live preview with the detector's moving blobs drawn on top, so the user
// can wave a disc over the camera and see it being picked up. The box has
// the video's own aspect ratio, so overlay coordinates map 1:1.
export function CameraView({
  videoRef,
  aspect,
  blobs,
  showMarkerGuide,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  aspect: { width: number; height: number } | null;
  blobs: OverlayBlob[];
  showMarkerGuide: boolean;
}) {
  const ratio =
    aspect && aspect.width > 0 ? aspect.width / aspect.height : 9 / 16;
  const guideDiameter = 2 * MARKER_GUIDE_RADIUS * Math.min(1, 1 / ratio) * 100;

  return (
    <div style={styles.outer}>
      <div
        style={{
          ...styles.frame,
          aspectRatio: String(ratio),
          width: `min(100%, calc(${MAX_HEIGHT_VH}vh * ${ratio}))`,
        }}
      >
        <video ref={videoRef} playsInline muted style={styles.video} />
        {blobs.map((b, i) => (
          <div
            key={i}
            style={{
              ...styles.blob,
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: `${Math.max(b.d * 100, 2)}%`,
            }}
          />
        ))}
        {showMarkerGuide && (
          <div style={{ ...styles.guide, width: `${guideDiameter}%` }} />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  outer: { display: "flex", justifyContent: "center", marginTop: "0.75rem" },
  frame: {
    position: "relative",
    background: "#000",
    borderRadius: 8,
    overflow: "hidden",
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  },
  blob: {
    position: "absolute",
    aspectRatio: "1",
    transform: "translate(-50%, -50%)",
    border: `2px solid ${colors.accent}`,
    borderRadius: "50%",
    pointerEvents: "none",
  },
  guide: {
    position: "absolute",
    left: "50%",
    top: "50%",
    aspectRatio: "1",
    transform: "translate(-50%, -50%)",
    border: `3px dashed ${colors.warn}`,
    borderRadius: "50%",
    pointerEvents: "none",
  },
};
