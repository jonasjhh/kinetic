import { useInstallPromptContext } from "./useInstallPromptContext";

export function InstallPrompt() {
  const { canInstall, promptInstall, dismiss } = useInstallPromptContext();

  if (!canInstall) {
    return null;
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.banner}>
        <span style={styles.text}>
          Install Kinetic for quick access and offline use.
        </span>
        <button
          style={styles.installButton}
          onClick={() => void promptInstall()}
        >
          Install
        </button>
        <button
          style={styles.closeButton}
          aria-label="Dismiss install prompt"
          onClick={dismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: "fixed",
    top: "0.75rem",
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    zIndex: 1000,
    padding: "0 1rem",
  },
  banner: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    background: "#12261f",
    border: "1px solid #2a4a44",
    borderRadius: 12,
    padding: "0.6rem 0.75rem 0.6rem 1rem",
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
    maxWidth: 480,
    width: "100%",
  },
  text: {
    flex: 1,
    fontSize: "0.85rem",
    color: "#e8f0ee",
  },
  installButton: {
    padding: "0.4rem 0.9rem",
    fontSize: "0.85rem",
    fontWeight: 600,
    borderRadius: 999,
    border: "none",
    background: "#38e0c4",
    color: "#0e1e2a",
    flexShrink: 0,
  },
  closeButton: {
    background: "none",
    border: "none",
    color: "#9fb3ac",
    fontSize: "1.3rem",
    lineHeight: 1,
    padding: "0 0.25rem",
    flexShrink: 0,
  },
};
