import { useState } from "react";
import { clearCalibration, loadCalibration } from "../speed/calibration";
import { loadDiscDiameterMm, saveDiscDiameterMm } from "../speed/settings";

export function SettingsScreen({
  onBack,
  onCalibrate,
}: {
  onBack: () => void;
  onCalibrate: () => void;
}) {
  const [diameterMm, setDiameterMm] = useState(() =>
    String(loadDiscDiameterMm()),
  );
  const [calibration, setCalibration] = useState(loadCalibration);

  const handleDiameterChange = (value: string) => {
    setDiameterMm(value);
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      saveDiscDiameterMm(parsed);
    }
  };

  return (
    <main style={styles.main}>
      <button style={styles.backButton} onClick={onBack}>
        ← Back
      </button>
      <h1 style={styles.h1}>Settings</h1>

      <label style={styles.label}>
        Disc diameter (mm)
        <input
          style={styles.input}
          type="number"
          inputMode="decimal"
          min={1}
          value={diameterMm}
          onChange={(e) => handleDiameterChange(e.target.value)}
        />
      </label>
      <p style={styles.help}>
        A standard driver is about 211mm across. Used to estimate the disc's
        distance from the camera during a scan.
      </p>

      <div style={styles.divider} />

      <h2 style={styles.h2}>Camera calibration</h2>
      <p style={styles.help}>
        {calibration
          ? `Calibrated — focal length ${calibration.focalLengthPx.toFixed(1)}px.`
          : "Not calibrated yet. Calibrate once per device before scanning."}
      </p>
      <button style={styles.primaryButton} onClick={onCalibrate}>
        {calibration ? "Recalibrate" : "Calibrate camera"}
      </button>
      {calibration && (
        <button
          style={styles.secondaryButton}
          onClick={() => {
            clearCalibration();
            setCalibration(null);
          }}
        >
          Clear calibration
        </button>
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
  h1: { margin: "0 0 1rem" },
  h2: { margin: "0 0 0.5rem", fontSize: "1.1rem" },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
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
  help: { color: "#9fb3ac", fontSize: "0.85rem", lineHeight: 1.4 },
  divider: {
    height: 1,
    background: "#1e3730",
    margin: "1.5rem 0",
  },
  primaryButton: {
    width: "100%",
    padding: "0.75rem",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: 999,
    border: "none",
    background: "#38e0c4",
    color: "#0e1e2a",
    marginTop: "0.5rem",
  },
  secondaryButton: {
    width: "100%",
    padding: "0.75rem",
    fontSize: "0.9rem",
    borderRadius: 999,
    border: "1px solid #ff6b6b",
    background: "transparent",
    color: "#ff6b6b",
    marginTop: "0.5rem",
  },
};
