import { useState } from "react";
import { InstallPrompt } from "./app/InstallPrompt";
import { CalibrationScreen } from "./screens/CalibrationScreen";
import { ScanScreen } from "./screens/ScanScreen";
import { SettingsScreen } from "./screens/SettingsScreen";

type Screen = "scan" | "settings" | "calibration";

function CurrentScreen({
  screen,
  setScreen,
}: {
  screen: Screen;
  setScreen: (screen: Screen) => void;
}) {
  if (screen === "settings") {
    return (
      <SettingsScreen
        onBack={() => setScreen("scan")}
        onCalibrate={() => setScreen("calibration")}
      />
    );
  }

  if (screen === "calibration") {
    return <CalibrationScreen onDone={() => setScreen("settings")} />;
  }

  return <ScanScreen onOpenSettings={() => setScreen("settings")} />;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("scan");

  return (
    <>
      <InstallPrompt />
      <CurrentScreen screen={screen} setScreen={setScreen} />
    </>
  );
}
