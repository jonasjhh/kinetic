import type { CSSProperties } from "react";

export const colors = {
  background: "#0e1e2a",
  panel: "#12261f",
  border: "#2a4a44",
  divider: "#1e3730",
  text: "#e8f0ee",
  muted: "#9fb3ac",
  faint: "#5c7269",
  accent: "#38e0c4",
  warn: "#f5c065",
  bad: "#ff6b6b",
};

export const page: CSSProperties = {
  fontFamily: "sans-serif",
  padding: "1.5rem",
  color: colors.text,
  maxWidth: 480,
  margin: "0 auto",
};

export const primaryButton: CSSProperties = {
  width: "100%",
  padding: "0.9rem",
  fontSize: "1.05rem",
  fontWeight: 600,
  borderRadius: 999,
  border: "none",
  background: colors.accent,
  color: colors.background,
};

export const secondaryButton: CSSProperties = {
  width: "100%",
  padding: "0.7rem",
  fontSize: "0.95rem",
  borderRadius: 999,
  border: `1px solid ${colors.border}`,
  background: "transparent",
  color: colors.text,
};

export const linkButton: CSSProperties = {
  background: "none",
  border: "none",
  color: colors.accent,
  fontSize: "1rem",
  padding: 0,
};

export const pillButton: CSSProperties = {
  background: "none",
  border: `1px solid ${colors.border}`,
  color: colors.muted,
  borderRadius: 999,
  padding: "0.4rem 0.9rem",
  fontSize: "0.85rem",
};

export const help: CSSProperties = {
  color: colors.muted,
  fontSize: "0.85rem",
  lineHeight: 1.45,
};

export const input: CSSProperties = {
  fontSize: "1.1rem",
  padding: "0.5rem",
  borderRadius: 8,
  border: `1px solid ${colors.border}`,
  background: colors.background,
  color: colors.text,
};

export const label: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  fontSize: "0.9rem",
  marginTop: "1rem",
};
