import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisConfig, PassOutcome } from "../analysis/types";
import type {
  AnalysisCommand,
  AnalysisEvent,
  CaptureCommand,
  CaptureEvent,
  CaptureHealth,
  MarkerCheck,
  OverlayBlob,
} from "./messages";

// Frames buffered inside the track processor if the worker falls behind;
// anything beyond this is dropped (and shows up in the health readout).
const PROCESSOR_BUFFER_FRAMES = 4;
const BRIGHTNESS_TIMEOUT_MS = 1500;

export interface Pipeline {
  health: CaptureHealth | null;
  overlay: OverlayBlob[];
  armedReady: boolean;
  error: string | null;
  arm(): void;
  disarm(): void;
  setOverlay(enabled: boolean): void;
  resetHealth(): void;
  checkMarker(): Promise<MarkerCheck>;
  measureBrightness(): Promise<number>;
  exportLastPass(): Promise<ArrayBuffer | null>;
}

interface Workers {
  capture: Worker;
  analysis: Worker;
}

// Wires the camera track into the capture worker (every frame, with its
// capture timestamp) and the capture worker into the analysis worker. The
// main thread only receives health, overlay and results.
export function usePipeline({
  track,
  videoRef,
  analysisConfig,
  onPassDetected,
  onResult,
}: {
  track: MediaStreamTrack | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  analysisConfig: AnalysisConfig;
  onPassDetected: (id: number) => void;
  onResult: (id: number, outcome: PassOutcome) => void;
}): Pipeline {
  const [health, setHealth] = useState<CaptureHealth | null>(null);
  const [overlay, setOverlayBlobs] = useState<OverlayBlob[]>([]);
  const [armedReady, setArmedReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workersRef = useRef<Workers | null>(null);
  const callbacks = useRef({ onPassDetected, onResult });
  callbacks.current = { onPassDetected, onResult };
  const configRef = useRef(analysisConfig);
  configRef.current = analysisConfig;

  const pending = useRef({
    nextId: 1,
    brightness: new Map<number, (v: number) => void>(),
    marker: [] as ((r: MarkerCheck) => void)[],
    recording: [] as ((b: ArrayBuffer | null) => void)[],
  });

  useEffect(() => {
    if (!track) return;
    const capture = new Worker(new URL("./captureWorker.ts", import.meta.url), {
      type: "module",
    });
    const analysis = new Worker(
      new URL("./analysisWorker.ts", import.meta.url),
      { type: "module" },
    );
    workersRef.current = { capture, analysis };
    const channel = new MessageChannel();

    capture.onmessage = (e: MessageEvent<CaptureEvent>) => {
      const msg = e.data;
      switch (msg.type) {
        case "health":
          setHealth(msg.health);
          break;
        case "overlay":
          setOverlayBlobs(msg.blobs);
          break;
        case "armed":
          setArmedReady(true);
          break;
        case "passDetected":
          callbacks.current.onPassDetected(msg.id);
          break;
        case "markerCheck":
          pending.current.marker.shift()?.(msg.result);
          break;
        case "brightness": {
          const resolve = pending.current.brightness.get(msg.requestId);
          pending.current.brightness.delete(msg.requestId);
          resolve?.(msg.meanLuma);
          break;
        }
        case "error":
          setError(msg.message);
          break;
      }
    };
    analysis.onmessage = (e: MessageEvent<AnalysisEvent>) => {
      const msg = e.data;
      if (msg.type === "result")
        callbacks.current.onResult(msg.id, msg.outcome);
      else pending.current.recording.shift()?.(msg.buffer);
    };

    const analysisInit: AnalysisCommand = {
      type: "init",
      port: channel.port2,
      config: configRef.current,
    };
    analysis.postMessage(analysisInit, [channel.port2]);

    let stopFallback: (() => void) | null = null;
    if (typeof MediaStreamTrackProcessor !== "undefined") {
      const processor = new MediaStreamTrackProcessor({
        track,
        maxBufferSize: PROCESSOR_BUFFER_FRAMES,
      });
      const init: CaptureCommand = {
        type: "init",
        readable: processor.readable,
        analysisPort: channel.port1,
        discDiameterM: configRef.current.discDiameterM,
        source: "track-processor",
      };
      capture.postMessage(init, [processor.readable, channel.port1]);
    } else {
      const init: CaptureCommand = {
        type: "init",
        readable: null,
        analysisPort: channel.port1,
        discDiameterM: configRef.current.discDiameterM,
        source: "video-frame-callback",
      };
      capture.postMessage(init, [channel.port1]);
      stopFallback = startVideoFrameCallbackSource(videoRef, capture);
    }

    return () => {
      stopFallback?.();
      capture.terminate();
      analysis.terminate();
      workersRef.current = null;
      setArmedReady(false);
      setHealth(null);
    };
  }, [track, videoRef]);

  useEffect(() => {
    const workers = workersRef.current;
    if (!workers) return;
    const captureConfig: CaptureCommand = {
      type: "config",
      discDiameterM: analysisConfig.discDiameterM,
    };
    workers.capture.postMessage(captureConfig);
    const config: AnalysisCommand = { type: "config", config: analysisConfig };
    workers.analysis.postMessage(config);
  }, [analysisConfig]);

  const sendCapture = useCallback((command: CaptureCommand) => {
    workersRef.current?.capture.postMessage(command);
  }, []);

  const arm = useCallback(() => {
    setArmedReady(false);
    sendCapture({ type: "arm" });
  }, [sendCapture]);

  const disarm = useCallback(() => {
    setArmedReady(false);
    sendCapture({ type: "disarm" });
  }, [sendCapture]);

  const setOverlay = useCallback(
    (enabled: boolean) => {
      if (!enabled) setOverlayBlobs([]);
      sendCapture({ type: "overlay", enabled });
    },
    [sendCapture],
  );

  const resetHealth = useCallback(
    () => sendCapture({ type: "resetHealth" }),
    [sendCapture],
  );

  const checkMarker = useCallback(
    () =>
      new Promise<MarkerCheck>((resolve) => {
        pending.current.marker.push(resolve);
        sendCapture({ type: "markerCheck" });
      }),
    [sendCapture],
  );

  const measureBrightness = useCallback(
    () =>
      new Promise<number>((resolve) => {
        const requestId = pending.current.nextId++;
        pending.current.brightness.set(requestId, resolve);
        sendCapture({ type: "brightness", requestId });
        // No frames arriving: resolve NaN rather than hang the caller.
        setTimeout(() => {
          if (pending.current.brightness.delete(requestId)) resolve(NaN);
        }, BRIGHTNESS_TIMEOUT_MS);
      }),
    [sendCapture],
  );

  const exportLastPass = useCallback(
    () =>
      new Promise<ArrayBuffer | null>((resolve) => {
        const workers = workersRef.current;
        if (!workers) return resolve(null);
        pending.current.recording.push(resolve);
        const command: AnalysisCommand = { type: "exportLastPass" };
        workers.analysis.postMessage(command);
      }),
    [],
  );

  return {
    health,
    overlay,
    armedReady,
    error,
    arm,
    disarm,
    setOverlay,
    resetHealth,
    checkMarker,
    measureBrightness,
    exportLastPass,
  };
}

// Fallback for browsers without MediaStreamTrackProcessor: one callback per
// presented camera frame, wrapped as a VideoFrame with its capture time.
function startVideoFrameCallbackSource(
  videoRef: React.RefObject<HTMLVideoElement>,
  capture: Worker,
): () => void {
  let stopped = false;
  let handle = 0;
  let video: HTMLVideoElement | null = null;

  const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
    if (stopped || !video) return;
    try {
      const ms = meta.captureTime ?? meta.mediaTime * 1000;
      const frame = new VideoFrame(video, { timestamp: Math.round(ms * 1000) });
      const command: CaptureCommand = { type: "frame", frame };
      capture.postMessage(command, [frame]);
    } catch {
      // Frame not ready yet; the next callback will try again.
    }
    handle = video.requestVideoFrameCallback(onFrame);
  };

  const start = () => {
    if (stopped) return;
    video = videoRef.current;
    if (!video) {
      handle = window.setTimeout(start, 100);
      return;
    }
    handle = video.requestVideoFrameCallback(onFrame);
  };
  start();

  return () => {
    stopped = true;
    if (video) video.cancelVideoFrameCallback(handle);
    else window.clearTimeout(handle);
  };
}
