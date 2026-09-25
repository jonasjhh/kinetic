import { describe, expect, it } from "vitest";
import {
  defaultScene,
  SceneRenderer,
  type SceneConfig,
} from "../../testing/syntheticScene";
import { boxDownsample } from "../../vision/image";
import { MotionDetector } from "../motionDetector";
import { PassTracker, trackerConfigFor } from "../passTracker";
import { runPipeline } from "../../testing/runPipeline";

// A phone lying still with no throw must report nothing, however noisy the
// picture is.
function countPasses(scene: SceneConfig, fps: number, seconds: number): number {
  const renderer = new SceneRenderer(scene);
  const detW = 180;
  const detH = 320;
  const det = new Uint8Array(detW * detH);
  const detector = new MotionDetector(detW, detH);
  const tracker = new PassTracker(trackerConfigFor(0.211), detW, detH);
  let passes = 0;
  for (let i = 0; i < fps * seconds; i++) {
    boxDownsample(renderer.render(i / fps), 360, 2, det, detW, detH);
    const candidates = detector.process(det);
    if (detector.warmedUp)
      passes += tracker.update(i, i / fps, candidates).length;
  }
  return passes;
}

// No disc anywhere near the view.
const empty = { start: { x: 50, y: 50, z: 2 }, velocity: { x: 0, y: 0, z: 0 } };

describe("still phone, no throw", () => {
  it("heavy sensor noise", () => {
    expect(countPasses(defaultScene({ ...empty, noise: 14 }), 30, 8)).toBe(0);
  });

  it("brightness jitter and rolling flicker bands", () => {
    const scene = defaultScene({
      ...empty,
      noise: 6,
      clutter: {
        gainJitter: 0.06,
        bandAmplitude: 0.08,
        bandPeriodPx: 120,
        bandSpeedPxPerS: 300,
        specksPerFrame: 0,
        speckSizePx: 0,
      },
    });
    expect(countPasses(scene, 30, 8)).toBe(0);
  });

  it("small twinkling specks all over the frame", () => {
    const scene = defaultScene({
      ...empty,
      noise: 6,
      seed: 5,
      clutter: {
        gainJitter: 0.02,
        bandAmplitude: 0,
        bandPeriodPx: 1,
        bandSpeedPxPerS: 0,
        specksPerFrame: 25,
        speckSizePx: 8,
      },
    });
    expect(countPasses(scene, 60, 6)).toBe(0);
  });

  it("disc-sized blobs popping up at random produce no results", () => {
    // Far busier than any real sky: ~26 disc-sized blobs of random
    // brightness every frame. The tracker lets a few chance alignments
    // through; the full-resolution analysis must reject them.
    const scene = defaultScene({
      ...empty,
      noise: 4,
      seed: 9,
      clutter: {
        gainJitter: 0,
        bandAmplitude: 0,
        bandPeriodPx: 1,
        bandSpeedPxPerS: 0,
        specksPerFrame: 30,
        speckSizePx: 16,
      },
    });
    const { outcomes } = runPipeline(scene, 60, 480, 0);
    expect(outcomes.filter((o) => o.ok)).toHaveLength(0);
  });
});
