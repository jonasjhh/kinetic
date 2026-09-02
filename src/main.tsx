import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { InstallPromptProvider } from "./app/InstallPromptContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <InstallPromptProvider>
      <App />
    </InstallPromptProvider>
  </StrictMode>,
);
