import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalysisConfig,
  PassOutcome,
  PassResult,
} from "../analysis/types";
import {
  lockForScanning,
  unlockControls,
  type ControlStatus,
} from "../camera/cameraControls";
import { usePipeline } from "../capture/usePipeline";
import type { DeviceTilt } from "../device/useDeviceTilt";
import { lockPortrait, useWakeLock } from "../device/screen";
import { Feedback } from "../feedback/feedback";
import type { Settings } from "../settings/settings";
import { formatSpeed, spokenResult } from "./format";

export type ScanPhase = "idle" | "countdown" | "locking" | "warming" | "ready";

export interface ThrowRecord {
  id: number;
  at: number;
  result: PassResult;
}

const COUNTDOWN_S = 5;
const WARNING_CHECK_MS = 2000;
const WARNING_REPEAT_MS = 20000;
const MAX_TILT_DEG = 8;
const MIN_FPS = 25;
const MAX_DROP_FRACTION = 0.05;

export function useScanSession({
  track,
  videoRef,
  settings,
  tilt,
}: {
  track: MediaStreamTrack | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  settings: Settings;
  tilt: DeviceTilt | null;
}) {
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [countdown, setCountdown] = useState(0);
  const [throws, setThrows] = useState<ThrowRecord[]>([]);
  const [controls, setControls] = useState<ControlStatus | null>(null);
  const feedback = useMemo(() => new Feedback(), []);
  const sessionRef = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const analysisConfig: AnalysisConfig = useMemo(
    () => ({
      discDiameterM: settings.discDiameterMm / 1000,
      fovLongSideDeg: settings.fovLongSideDeg,
      throwType: settings.throwType,
    }),
    [settings.discDiameterMm, settings.fovLongSideDeg, settings.throwType],
  );

  // Only measured throws are reported. A detection the analysis rejects
  // (noise, a bird, a chance alignment) is dropped silently.
  const onResult = useCallback(
    (id: number, outcome: PassOutcome) => {
      if (!outcome.ok) return;
      setThrows((prev) => [...prev, { id, at: Date.now(), result: outcome }]);
      feedback.cue("measured");
      feedback.say(spokenResult(outcome, settingsRef.current.speedUnit));
    },
    [feedback],
  );

  const pipeline = usePipeline({
    track,
    videoRef,
    analysisConfig,
    onResult,
  });

  useWakeLock(phase !== "idle");

  useEffect(() => {
    feedback.voice = settings.voice;
  }, [feedback, settings.voice]);

  // warming → ready once the detector's background model has settled.
  useEffect(() => {
    if (phase === "warming" && pipeline.armedReady) {
      setPhase("ready");
      feedback.cue("ready");
      feedback.say("Ready. Throw when you like.");
    }
  }, [phase, pipeline.armedReady, feedback]);

  const start = useCallback(async () => {
    if (!track) return;
    const session = ++sessionRef.current;
    const alive = () => sessionRef.current === session;
    feedback.unlock();
    void lockPortrait();
    setThrows([]);

    setPhase("countdown");
    feedback.say(
      "Place the phone camera up, with its top pointing towards the target.",
      true,
    );
    for (let s = COUNTDOWN_S; s > 0; s--) {
      if (!alive()) return;
      setCountdown(s);
      feedback.cue("tick");
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!alive()) return;

    setPhase("locking");
    const status = await lockForScanning(track, pipeline.measureBrightness);
    if (!alive()) return;
    setControls(status);

    pipeline.resetHealth();
    pipeline.arm();
    setPhase("warming");
  }, [track, feedback, pipeline]);

  const stop = useCallback(() => {
    sessionRef.current++;
    pipeline.disarm();
    feedback.stopSpeaking();
    setPhase("idle");
    setControls(null);
    if (track) void unlockControls(track);
  }, [pipeline, feedback, track]);

  // Spoken warnings while the phone lies screen-down.
  const healthRef = useRef(pipeline.health);
  healthRef.current = pipeline.health;
  const tiltRef = useRef(tilt);
  tiltRef.current = tilt;
  useEffect(() => {
    if (phase !== "ready") return;
    const lastSaid = new Map<string, number>();
    let lastDropped = healthRef.current?.droppedFrames ?? 0;
    let lastTotal = healthRef.current?.totalFrames ?? 0;

    const warn = (key: string, text: string) => {
      const now = Date.now();
      if (now - (lastSaid.get(key) ?? 0) < WARNING_REPEAT_MS) return;
      lastSaid.set(key, now);
      feedback.cue("warning");
      feedback.say(text);
    };

    const timer = setInterval(() => {
      const t = tiltRef.current;
      if (t && !t.cameraUp)
        warn("facing", "The camera is facing down. Turn the phone over.");
      else if (t && t.tiltDeg > MAX_TILT_DEG)
        warn("tilt", "The phone is tilted. Put it on a flat spot.");

      const h = healthRef.current;
      if (h) {
        if (h.fps > 0 && h.fps < MIN_FPS)
          warn("fps", "The camera frame rate is low.");
        const frames = h.totalFrames - lastTotal;
        const dropped = h.droppedFrames - lastDropped;
        if (frames > 0 && dropped / (frames + dropped) > MAX_DROP_FRACTION)
          warn("drops", "The camera is dropping frames.");
        lastDropped = h.droppedFrames;
        lastTotal = h.totalFrames;
      }
    }, WARNING_CHECK_MS);
    return () => clearInterval(timer);
  }, [phase, feedback]);

  useEffect(() => () => void sessionRef.current++, []);

  return {
    phase,
    countdown,
    throws,
    controls,
    pipeline,
    start,
    stop,
    formatSpeed: (mps: number) => formatSpeed(mps, settings.speedUnit),
  };
}
