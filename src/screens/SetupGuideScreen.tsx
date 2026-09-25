import type { ReactNode } from "react";
import { colors, help, linkButton, page, primaryButton } from "../ui/theme";

interface Step {
  title: string;
  body: ReactNode;
  art: ReactNode;
}

const STROKE = colors.muted;

const STEPS: Step[] = [
  {
    title: "Mark the disc for spin",
    body: (
      <>
        Stick one strip of tape on the <b>underside</b>, from the centre to the
        rim. Use light tape on a dark disc, dark tape on a light one. Only one
        strip — a symmetric pattern can't show which way it turned. Without it,
        only speed is measured.
      </>
    ),
    art: (
      <svg viewBox="0 0 120 80" width="120" height="80">
        <circle
          cx="60"
          cy="40"
          r="34"
          fill="#23413a"
          stroke={STROKE}
          strokeWidth="2"
        />
        <rect x="60" y="36" width="31" height="8" rx="2" fill="#f4f1de" />
        <circle cx="60" cy="40" r="3" fill={STROKE} />
      </svg>
    ),
  },
  {
    title: "Place the phone in front of you",
    body: (
      <>
        On the ground on your throw line,{" "}
        <b>2–4 m in front of where you release</b>. The disc should pass over it
        about 1.5–2.5 m up, after it has left your hand — directly under you,
        your arm and body fill the view.
      </>
    ),
    art: (
      <svg viewBox="0 0 160 80" width="160" height="80">
        <circle cx="18" cy="40" r="9" fill={STROKE} />
        <text x="18" y="70" fontSize="10" fill={STROKE} textAnchor="middle">
          you
        </text>
        <rect
          x="72"
          y="32"
          width="10"
          height="16"
          rx="2"
          fill={colors.accent}
        />
        <text x="77" y="70" fontSize="10" fill={STROKE} textAnchor="middle">
          2–4 m
        </text>
        <line
          x1="30"
          y1="40"
          x2="148"
          y2="40"
          stroke={STROKE}
          strokeWidth="2"
          strokeDasharray="5 4"
        />
        <polygon points="148,34 158,40 148,46" fill={STROKE} />
        <text x="140" y="24" fontSize="10" fill={STROKE} textAnchor="middle">
          target
        </text>
      </svg>
    ),
  },
  {
    title: "Camera up, top towards the target",
    body: (
      <>
        Lay it <b>flat with the camera facing the sky</b> (screen down), and the{" "}
        <b>top edge pointing at the target</b>, so the long side runs along the
        throw line. That gives the most frames and avoids rolling-shutter error.
        On bumpy grass, rest it on something flat — the app warns if it's
        tilted.
      </>
    ),
    art: (
      <svg viewBox="0 0 120 80" width="120" height="80">
        <rect
          x="45"
          y="12"
          width="30"
          height="56"
          rx="5"
          fill="none"
          stroke={colors.accent}
          strokeWidth="2.5"
        />
        <circle cx="53" cy="20" r="3.5" fill={colors.accent} />
        <line x1="60" y1="8" x2="60" y2="-4" stroke={STROKE} strokeWidth="2" />
        <polygon
          points="54,4 60,-6 66,4"
          fill={STROKE}
          transform="translate(0,4)"
        />
        <text x="95" y="16" fontSize="10" fill={STROKE}>
          target
        </text>
      </svg>
    ),
  },
  {
    title: "Daylight, sun out of view",
    body: (
      <>
        Throw in daylight, and avoid placing the phone where the sun shines
        straight into the camera.
      </>
    ),
    art: (
      <svg viewBox="0 0 120 80" width="120" height="80">
        <circle cx="60" cy="40" r="14" fill={colors.warn} />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={i}
              x1={60 + 20 * Math.cos(a)}
              y1={40 + 20 * Math.sin(a)}
              x2={60 + 28 * Math.cos(a)}
              y2={40 + 28 * Math.sin(a)}
              stroke={colors.warn}
              strokeWidth="3"
            />
          );
        })}
      </svg>
    ),
  },
  {
    title: "Start, place, listen",
    body: (
      <>
        Press <b>Start</b> and put the phone down during the countdown. From
        then on it talks to you:
        <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.2rem" }}>
          <li>two rising tones — ready, throw away</li>
          <li>high beep + spoken speed and spin — throw measured</li>
          <li>low double beep — throw seen but not measured</li>
          <li>
            long low tone + message — something needs fixing (tilt, frame drops)
          </li>
        </ul>
        Pick the phone up any time to see every throw.
      </>
    ),
    art: (
      <svg viewBox="0 0 120 80" width="120" height="80">
        <path d="M40 30 h12 l14 -12 v44 l-14 -12 h-12 z" fill={colors.accent} />
        <path
          d="M76 28 q10 12 0 24"
          stroke={colors.accent}
          strokeWidth="3"
          fill="none"
        />
        <path
          d="M84 20 q18 20 0 40"
          stroke={colors.accent}
          strokeWidth="3"
          fill="none"
        />
      </svg>
    ),
  },
];

export function SetupGuideScreen({ onDone }: { onDone: () => void }) {
  return (
    <main style={page}>
      <button style={linkButton} onClick={onDone}>
        ← Back
      </button>
      <h1 style={{ margin: "0.5rem 0 0.25rem" }}>Setting up</h1>
      <p style={help}>
        Kinetic measures a disc as it flies over your phone's camera.
      </p>
      {STEPS.map((step, i) => (
        <section key={step.title} style={styles.step}>
          <div style={styles.art}>{step.art}</div>
          <div>
            <h2 style={styles.title}>
              {i + 1}. {step.title}
            </h2>
            <div style={styles.body}>{step.body}</div>
          </div>
        </section>
      ))}
      <button
        style={{ ...primaryButton, marginTop: "1.25rem" }}
        onClick={onDone}
      >
        Got it
      </button>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  step: {
    marginTop: "1rem",
    padding: "0.9rem",
    borderRadius: 12,
    background: colors.panel,
  },
  art: {
    display: "flex",
    justifyContent: "center",
    marginBottom: "0.5rem",
    overflow: "visible",
  },
  title: { margin: "0 0 0.3rem", fontSize: "1.05rem" },
  body: { color: colors.muted, fontSize: "0.9rem", lineHeight: 1.45 },
};
