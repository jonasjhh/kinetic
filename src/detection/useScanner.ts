import { useEffect, useRef, useState } from "react";
import { EventCapture, type ScanPhase } from "./eventCapture";
import { FrameAnalyzer } from "./frameAnalyzer";
import type { PassEvent } from "./types";

const DEBUG_UPDATE_INTERVAL_MS = 150;

export interface ScanDebugInfo {
  pixelCount: number;
  frameSeen: boolean;
}

export function useScanner({
  videoRef,
  active,
  onEvent,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  active: boolean;
  onEvent: (event: PassEvent) => void;
}) {
  const [phase, setPhase] = useState<ScanPhase>("armed");
  const [debug, setDebug] = useState<ScanDebugInfo>({
    pixelCount: 0,
    frameSeen: false,
  });
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!active) {
      setDebug({ pixelCount: 0, frameSeen: false });
      return;
    }

    const analyzer = new FrameAnalyzer();
    const capture = new EventCapture();
    let lastPhase: ScanPhase = "armed";
    let lastDebugUpdate = 0;
    let frameId: number;

    const tick = () => {
      const video = videoRef.current;
      if (video) {
        const now = performance.now();
        const sample = analyzer.sample(video, now);
        const event = capture.update(sample, now);
        if (capture.phase !== lastPhase) {
          lastPhase = capture.phase;
          setPhase(capture.phase);
        }
        if (event) onEventRef.current(event);

        // Throttled so the debug readout doesn't force a re-render on
        // every single frame (up to 60/sec).
        if (now - lastDebugUpdate > DEBUG_UPDATE_INTERVAL_MS) {
          lastDebugUpdate = now;
          setDebug({ pixelCount: sample?.pixelCount ?? 0, frameSeen: true });
        }
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [active, videoRef]);

  return { phase, debug };
}
