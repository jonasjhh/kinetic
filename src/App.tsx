import { useState } from "react";
import { InstallPrompt } from "./app/InstallPrompt";
import { ScanScreen } from "./screens/ScanScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SetupGuideScreen } from "./screens/SetupGuideScreen";
import { useSettings } from "./settings/settings";

type Screen = "scan" | "settings" | "guide";

export function App() {
  const { settings, update } = useSettings();
  const [screen, setScreen] = useState<Screen>(() =>
    settings.setupGuideSeen ? "scan" : "guide",
  );
  const [returnTo, setReturnTo] = useState<Screen>("scan");

  const openGuide = (from: Screen) => {
    setReturnTo(from);
    setScreen("guide");
  };

  return (
    <>
      <InstallPrompt />
      {screen === "guide" && (
        <SetupGuideScreen
          onDone={() => {
            update({ setupGuideSeen: true });
            setScreen(returnTo);
          }}
        />
      )}
      {screen === "settings" && (
        <SettingsScreen
          settings={settings}
          update={update}
          onBack={() => setScreen("scan")}
          onOpenGuide={() => openGuide("settings")}
        />
      )}
      {screen === "scan" && (
        <ScanScreen
          settings={settings}
          onOpenSettings={() => setScreen("settings")}
          onOpenGuide={() => openGuide("scan")}
        />
      )}
    </>
  );
}
