import type { ThrowRecord } from "../scan/useScanSession";
import { roundRpm } from "../scan/format";
import { colors, pillButton } from "../ui/theme";

export function ThrowList({
  throws,
  formatSpeed,
  onSaveLast,
}: {
  throws: ThrowRecord[];
  formatSpeed: (mps: number) => string;
  onSaveLast: () => void;
}) {
  if (throws.length === 0) return null;
  return (
    <div style={styles.list}>
      <div style={styles.header}>
        <h2 style={styles.heading}>
          {throws.length} throw{throws.length === 1 ? "" : "s"}
        </h2>
        <button style={pillButton} onClick={onSaveLast}>
          Save last pass
        </button>
      </div>
      {throws.map((t, i) => (
        <div key={t.id} style={styles.row}>
          <span style={styles.index}>#{i + 1}</span>
          <div style={{ flex: 1 }}>{renderOutcome(t, formatSpeed)}</div>
        </div>
      ))}
    </div>
  );
}

function renderOutcome(t: ThrowRecord, formatSpeed: (mps: number) => string) {
  const o = t.outcome;
  if (!o) return <span style={styles.sub}>Analysing…</span>;
  if (!o.ok)
    return <span style={styles.failed}>Not measured — {o.reason}</span>;
  return (
    <>
      <div style={styles.main}>
        <span style={styles.speed}>{formatSpeed(o.speedMps)}</span>
        {o.spin && (
          <span style={styles.spin}>
            {roundRpm(o.spin.rpm)} rpm{" "}
            {o.spin.directionFromAbove === "cw" ? "↻" : "↺"}
          </span>
        )}
      </div>
      <div style={styles.sub}>
        launch {o.launchAngleDeg.toFixed(0)}° · height {o.heightM.toFixed(1)} m
        · {o.framesUsed} frames · {o.confidence} confidence
        {o.spin &&
          o.spin.confidence !== "high" &&
          ` · spin ${o.spin.confidence}`}
      </div>
      {o.spinNote && <div style={styles.note}>{o.spinNote}</div>}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: {
    marginTop: "1.25rem",
    padding: "0.75rem 1rem",
    borderRadius: 12,
    background: colors.panel,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.5rem",
  },
  heading: {
    margin: 0,
    fontSize: "0.95rem",
    fontWeight: 600,
    color: colors.muted,
  },
  row: {
    display: "flex",
    alignItems: "baseline",
    gap: "0.6rem",
    padding: "0.55rem 0",
    borderTop: `1px solid ${colors.divider}`,
  },
  index: { color: colors.faint, fontSize: "0.85rem", minWidth: "1.75rem" },
  main: { display: "flex", alignItems: "baseline", gap: "0.8rem" },
  speed: { fontSize: "1.3rem", fontWeight: 700, color: colors.accent },
  spin: { fontSize: "1rem", fontWeight: 600, color: colors.text },
  sub: { color: colors.muted, fontSize: "0.8rem", marginTop: "0.15rem" },
  note: { color: colors.warn, fontSize: "0.78rem", marginTop: "0.2rem" },
  failed: { color: colors.muted, fontSize: "0.85rem" },
};
