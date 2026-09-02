import { createContext, useContext } from "react";

export interface InstallPromptContextValue {
  canInstall: boolean;
  promptInstall: () => Promise<void>;
  dismiss: () => void;
}

export const InstallPromptContext =
  createContext<InstallPromptContextValue | null>(null);

export function useInstallPromptContext(): InstallPromptContextValue {
  const context = useContext(InstallPromptContext);
  if (!context) {
    throw new Error(
      "useInstallPromptContext must be used within an InstallPromptProvider",
    );
  }
  return context;
}
