import { measureMarker } from "../analysis/spin";
import { MotionDetector } from "../detection/motionDetector";
import { PassTracker, trackerConfigFor } from "../detection/passTracker";
import { boxDownsample, median } from "../vision/image";
import { buildPassPayload, FrameRing } from "./frameRing";
import type {
  AnalyzeRequest,
  CaptureCommand,
  CaptureEvent,
  CaptureHealth,
  OverlayBlob,
} from "./messages";
import { MARKER_GUIDE_RADIUS } from "./markerGuide";
import { createLumaReader, frameSize } from "./readLuma";
import { workerScope as scope } from "./workerScope";

// Receives every camera frame, keeps the last ~40 in a ring buffer, runs
// the low-resolution detector and hands confirmed passes to the analysis
// worker. It never pauses: there is no cooldown, and analysis happens
// elsewhere, so a throw can't arrive while the pipeline is "busy".

const RING_CAPACITY = 40;
const DETECTION_LONG_SIDE = 320;
const MAX_STORED_LONG_SIDE = 1400;
const HEALTH_INTERVAL_MS = 500;
const OVERLAY_INTERVAL_MS = 100;
const PERIOD_WINDOW = 90;
const MAX_QUEUED_FRAMES = 2;

interface Geometry {
  rawWidth: number;
  rawHeight: number;
  storeFactor: number;
  width: number;
  height: number;
  detFactor: number;
  detWidth: number;
  detHeight: number;
  raw: Uint8Array | null;
  det: Uint8Array;
  ring: FrameRing;
  detector: MotionDetector;
  tracker: PassTracker;
}

const post = (event: CaptureEvent, transfer: Transferable[] = []) =>
  scope.postMessage(event, transfer);

const reader = createLumaReader();
let analysisPort: MessagePort | null = null;
let source: CaptureHealth["source"] = "track-processor";
let discDiameterM = 0.211;
let geometry: Geometry | null = null;
let frameCounter = 0;
let passId = 0;

let armed = false;
let armedAnnounced = false;
let overlayEnabled = false;
let lastOverlayPost = 0;
let markerCheckPending = false;
const brightnessRequests: number[] = [];

let lastTimestamp: number | null = null;
const periods: number[] = [];
let droppedFrames = 0;
let totalFrames = 0;
let processingSum = 0;
let processingCount = 0;
let lastHealthPost = 0;
let reportedError = false;

const queue: VideoFrame[] = [];
let draining = false;

scope.onmessage = (e: MessageEvent<CaptureCommand>) => {
  const msg = e.data;
  switch (msg.type) {
    case "init":
      analysisPort = msg.analysisPort;
      discDiameterM = msg.discDiameterM;
      source = msg.source;
      if (msg.readable) void pump(msg.readable);
      break;
    case "frame":
      queue.push(msg.frame);
      while (queue.length > MAX_QUEUED_FRAMES) queue.shift()!.close();
      void drain();
      break;
    case "arm":
      armed = true;
      armedAnnounced = false;
      geometry?.detector.reset();
      geometry?.tracker.reset();
      break;
    case "disarm":
      armed = false;
      geometry?.tracker.reset();
      break;
    case "config":
      discDiameterM = msg.discDiameterM;
      geometry?.tracker.setConfig(trackerConfigFor(discDiameterM));
      break;
    case "overlay":
      overlayEnabled = msg.enabled;
      break;
    case "markerCheck":
      markerCheckPending = true;
      break;
    case "brightness":
      brightnessRequests.push(msg.requestId);
      break;
    case "resetHealth":
      droppedFrames = 0;
      totalFrames = 0;
      break;
  }
};

async function pump(readable: ReadableStream<VideoFrame>) {
  const r = readable.getReader();
  for (;;) {
    const { value, done } = await r.read();
    if (done) return;
    await processFrame(value);
  }
}

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) await processFrame(queue.shift()!);
  draining = false;
}

async function processFrame(frame: VideoFrame) {
  const started = performance.now();
  try {
    const { width: rawWidth, height: rawHeight } = frameSize(frame);
    const g = ensureGeometry(rawWidth, rawHeight);
    const index = frameCounter++;
    const t = frame.timestamp;

    const target = g.raw ?? g.ring.slotFor(index);
    await reader.read(frame, target, rawWidth, rawHeight);
    frame.close(); // release the camera buffer as early as possible
    const stored = g.ring.slotFor(index);
    if (g.raw) {
      boxDownsample(g.raw, rawWidth, g.storeFactor, stored, g.width, g.height);
    }
    g.ring.commit(index, t);
    trackTiming(t);

    boxDownsample(stored, g.width, g.detFactor, g.det, g.detWidth, g.detHeight);
    const candidates = g.detector.process(g.det);

    if (armed && g.detector.warmedUp) {
      if (!armedAnnounced) {
        armedAnnounced = true;
        post({ type: "armed" });
      }
      for (const pass of g.tracker.update(index, t / 1e6, candidates)) {
        emitPass(g, pass);
      }
    }

    while (brightnessRequests.length) {
      post({
        type: "brightness",
        requestId: brightnessRequests.shift()!,
        meanLuma: g.detector.lastMeanLuma,
      });
    }

    const now = performance.now();
    if (overlayEnabled && now - lastOverlayPost > OVERLAY_INTERVAL_MS) {
      lastOverlayPost = now;
      const blobs: OverlayBlob[] = candidates.slice(0, 10).map((c) => ({
        x: (c.x + 0.5) / g.detWidth,
        y: (c.y + 0.5) / g.detHeight,
        d: (c.border ? c.major : c.minor) / g.detWidth,
      }));
      post({ type: "overlay", blobs });
    }

    if (markerCheckPending) {
      markerCheckPending = false;
      const radius = MARKER_GUIDE_RADIUS * Math.min(g.width, g.height);
      const marker = measureMarker(
        stored,
        g.width,
        g.height,
        (g.width - 1) / 2,
        (g.height - 1) / 2,
        radius,
      );
      const score = marker
        ? Math.max(marker.bright.score, marker.dark.score)
        : 0;
      post({
        type: "markerCheck",
        result: { discFound: marker !== null, markerScore: score },
      });
    }
  } catch (err) {
    if (!reportedError) {
      reportedError = true;
      post({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    frame.close();
    processingSum += performance.now() - started;
    processingCount++;
    maybePostHealth();
  }
}

function ensureGeometry(rawWidth: number, rawHeight: number): Geometry {
  if (
    geometry &&
    geometry.rawWidth === rawWidth &&
    geometry.rawHeight === rawHeight
  ) {
    return geometry;
  }
  const storeFactor =
    Math.max(rawWidth, rawHeight) > MAX_STORED_LONG_SIDE ? 2 : 1;
  const width = Math.floor(rawWidth / storeFactor);
  const height = Math.floor(rawHeight / storeFactor);
  const detFactor = Math.max(
    1,
    Math.round(Math.max(width, height) / DETECTION_LONG_SIDE),
  );
  const detWidth = Math.floor(width / detFactor);
  const detHeight = Math.floor(height / detFactor);
  geometry = {
    rawWidth,
    rawHeight,
    storeFactor,
    width,
    height,
    detFactor,
    detWidth,
    detHeight,
    raw: storeFactor > 1 ? new Uint8Array(rawWidth * rawHeight) : null,
    det: new Uint8Array(detWidth * detHeight),
    ring: new FrameRing(width, height, RING_CAPACITY),
    detector: new MotionDetector(detWidth, detHeight),
    tracker: new PassTracker(trackerConfigFor(discDiameterM)),
  };
  armedAnnounced = false;
  return geometry;
}

function emitPass(g: Geometry, pass: Parameters<typeof buildPassPayload>[1]) {
  if (!analysisPort) return;
  const id = ++passId;
  const payload = buildPassPayload(
    g.ring,
    pass,
    id,
    g.detFactor,
    framePeriodUs(),
  );
  const transfer: Transferable[] = [
    ...payload.frames.map((f) => f.data.buffer as ArrayBuffer),
    ...payload.backgroundFrames.map((b) => b.buffer as ArrayBuffer),
  ];
  const request: AnalyzeRequest = { type: "analyze", payload };
  analysisPort.postMessage(request, transfer);
  post({ type: "passDetected", id });
}

function framePeriodUs(): number | null {
  return periods.length >= 10 ? median(periods) : null;
}

function trackTiming(t: number) {
  totalFrames++;
  if (lastTimestamp !== null) {
    const dt = t - lastTimestamp;
    if (dt > 0) {
      const period = framePeriodUs();
      if (period && dt > 1.5 * period) {
        droppedFrames += Math.round(dt / period) - 1;
      }
      periods.push(dt);
      if (periods.length > PERIOD_WINDOW) periods.shift();
    }
  }
  lastTimestamp = t;
}

function maybePostHealth() {
  const now = performance.now();
  if (now - lastHealthPost < HEALTH_INTERVAL_MS || !geometry) return;
  lastHealthPost = now;
  const period = framePeriodUs();
  post({
    type: "health",
    health: {
      fps: period ? 1e6 / period : 0,
      droppedFrames,
      totalFrames,
      meanLuma: geometry.detector.lastMeanLuma,
      width: geometry.rawWidth,
      height: geometry.rawHeight,
      processingMs: processingCount ? processingSum / processingCount : 0,
      source,
    },
  });
  processingSum = 0;
  processingCount = 0;
}
