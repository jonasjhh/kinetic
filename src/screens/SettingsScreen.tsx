import { useState } from "react";
import type { ThrowType } from "../analysis/types";
import {
  THROW_TYPE_LABEL,
  type Settings,
  type SpeedUnit,
} from "../settings/settings";
import {
  colors,
  help,
  input,
  label,
  linkButton,
  page,
  secondaryButton,
} from "../ui/theme";

export function SettingsScreen({
  settings,
  update,
  onBack,
  onOpenGuide,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onBack: () => void;
  onOpenGuide: () => void;
}) {
  const [diameter, setDiameter] = useState(String(settings.discDiameterMm));
  const [fov, setFov] = useState(String(settings.fovLongSideDeg));

  // Keeps the raw text while typing; only in-range numbers are saved.
  const numberField =
    (
      set: (v: string) => void,
      apply: (n: number) => void,
      min: number,
      max: number,
    ) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      set(e.target.value);
      const n = Number(e.target.value);
      if (Number.isFinite(n) && n >= min && n <= max) apply(n);
    };

  return (
    <main style={page}>
      <button style={linkButton} onClick={onBack}>
        ← Back
      </button>
      <h1 style={{ margin: "0.5rem 0 0.5rem" }}>Settings</h1>

      <label style={label}>
        Throw type
        <select
          style={input}
          value={settings.throwType}
          onChange={(e) => update({ throwType: e.target.value as ThrowType })}
        >
          {(Object.keys(THROW_TYPE_LABEL) as ThrowType[]).map((t) => (
            <option key={t} value={t}>
              {THROW_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <p style={help}>
        Tells the app which way the disc spins. Needed to read spin correctly
        when the camera runs at 30 fps.
      </p>

      <label style={label}>
        Disc diameter (mm)
        <input
          style={input}
          type="number"
          inputMode="decimal"
          value={diameter}
          onChange={numberField(
            setDiameter,
            (n) => update({ discDiameterMm: n }),
            100,
            300,
          )}
        />
      </label>
      <p style={help}>
        The scale for every measurement — speed is proportional to it. Most
        drivers and midranges are 211–217 mm, putters up to ~218 mm.
      </p>

      <label style={label}>
        Speed unit
        <select
          style={input}
          value={settings.speedUnit}
          onChange={(e) => update({ speedUnit: e.target.value as SpeedUnit })}
        >
          <option value="kmh">km/h</option>
          <option value="mph">mph</option>
        </select>
      </label>

      <label
        style={{
          ...label,
          flexDirection: "row",
          alignItems: "center",
          gap: "0.6rem",
        }}
      >
        <input
          type="checkbox"
          checked={settings.voice}
          onChange={(e) => update({ voice: e.target.checked })}
        />
        Speak results aloud
      </label>

      <div style={styles.divider} />
      <h2 style={styles.h2}>Advanced</h2>
      <label style={label}>
        Camera field of view, long side (°)
        <input
          style={input}
          type="number"
          inputMode="decimal"
          value={fov}
          onChange={numberField(
            setFov,
            (n) => update({ fovLongSideDeg: n }),
            30,
            130,
          )}
        />
      </label>
      <p style={help}>
        Only used for the small vertical part of the speed and for the height
        readout; horizontal speed doesn't depend on it. Phone main cameras are
        typically 65–72°.
      </p>

      <div style={styles.divider} />
      <button style={secondaryButton} onClick={onOpenGuide}>
        Show setup guide
      </button>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  divider: { height: 1, background: colors.divider, margin: "1.5rem 0" },
  h2: { margin: 0, fontSize: "1.05rem" },
};
