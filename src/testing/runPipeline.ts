import { analyzePass } from "../analysis/analyzePass";
import type { AnalysisConfig, PassOutcome } from "../analysis/types";
import { buildPassPayload, FrameRing } from "../capture/frameRing";
import { MotionDetector } from "../detection/motionDetector";
import { PassTracker, trackerConfigFor } from "../detection/passTracker";
import type { PassDetection } from "../detection/types";
import { boxDownsample } from "../vision/image";
import { SceneRenderer, type SceneConfig } from "./syntheticScene";

// fovLongSideDeg that corresponds to the scene's focal length.
export function fovFor(scene: SceneConfig): number {
  const long = Math.max(scene.width, scene.height);
  return (2 * Math.atan(long / 2 / scene.focalLengthPx) * 180) / Math.PI;
}

// Runs rendered frames through the same stages as the capture worker:
// downsample → detector → tracker → ring → payload → analysis.
export function runPipeline(
  scene: SceneConfig,
  fps: number,
  frameCount: number,
  passStartS: number,
): { passes: PassDetection[]; outcomes: PassOutcome[] } {
  const renderer = new SceneRenderer(scene);
  const factor = 2;
  const detW = Math.floor(scene.width / factor);
  const detH = Math.floor(scene.height / factor);
  const det = new Uint8Array(detW * detH);
  const detector = new MotionDetector(detW, detH);
  const tracker = new PassTracker(
    trackerConfigFor(scene.discDiameterM),
    detW,
    detH,
  );
  const ring = new FrameRing(scene.width, scene.height, 40);
  const config: AnalysisConfig = {
    discDiameterM: scene.discDiameterM,
    fovLongSideDeg: fovFor(scene),
    throwType: "rhbh",
  };

  const passes: PassDetection[] = [];
  const outcomes: PassOutcome[] = [];
  for (let i = 0; i < frameCount; i++) {
    const tCapture = i / fps;
    // Disc motion is expressed relative to passStartS.
    const frame = renderer.render(tCapture - passStartS);
    ring.slotFor(i).set(frame);
    ring.commit(i, Math.round(tCapture * 1e6));
    boxDownsample(frame, scene.width, factor, det, detW, detH);
    const candidates = detector.process(det);
    if (!detector.warmedUp) continue;
    for (const pass of tracker.update(i, tCapture, candidates)) {
      passes.push(pass);
      const payload = buildPassPayload(
        ring,
        pass,
        passes.length,
        factor,
        1e6 / fps,
      );
      outcomes.push(analyzePass(payload, config));
    }
  }
  return { passes, outcomes };
}
