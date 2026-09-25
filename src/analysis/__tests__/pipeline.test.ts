import { describe, expect, it } from "vitest";
import { MotionDetector } from "../../detection/motionDetector";
import { PassTracker, trackerConfigFor } from "../../detection/passTracker";
import { runPipeline } from "../../testing/runPipeline";
import { defaultScene, SceneRenderer } from "../../testing/syntheticScene";
import { boxDownsample } from "../../vision/image";
import type { PassOutcome } from "../types";

function expectResult(outcome: PassOutcome | undefined) {
  expect(outcome).toBeDefined();
  if (!outcome || !outcome.ok) {
    throw new Error(
      `analysis failed: ${outcome && !outcome.ok ? outcome.reason : "none"}`,
    );
  }
  return outcome;
}

describe("full pipeline on synthetic throws", () => {
  it("measures a 25 m/s, 1080 rpm pass at 60 fps", () => {
    const scene = defaultScene();
    const { passes, outcomes } = runPipeline(scene, 60, 45, 0.4);
    expect(passes).toHaveLength(1);
    const result = expectResult(outcomes[0]);
    const trueSpeed = Math.hypot(
      scene.velocity.x,
      scene.velocity.y,
      scene.velocity.z,
    );
    expect(result.speedMps / trueSpeed).toBeGreaterThan(0.97);
    expect(result.speedMps / trueSpeed).toBeLessThan(1.03);
    expect(result.heightM).toBeGreaterThan(1.8);
    expect(result.heightM).toBeLessThan(2.3);
    expect(result.spin).not.toBeNull();
    expect(result.spin!.rpm).toBeGreaterThan(1080 * 0.97);
    expect(result.spin!.rpm).toBeLessThan(1080 * 1.03);
    expect(result.spin!.directionFromAbove).toBe("cw");
  });

  it("handles 30 fps with 4 ms motion blur", () => {
    const scene = defaultScene({
      exposureS: 0.004,
      velocity: { x: 0.5, y: -30, z: 0 },
      spinRps: -14,
      seed: 7,
    });
    const { passes, outcomes } = runPipeline(scene, 30, 25, 0.5);
    expect(passes).toHaveLength(1);
    const result = expectResult(outcomes[0]);
    const trueSpeed = Math.hypot(scene.velocity.x, scene.velocity.y);
    expect(result.speedMps / trueSpeed).toBeGreaterThan(0.96);
    expect(result.speedMps / trueSpeed).toBeLessThan(1.04);
  });

  it("measures speed without a marker and says spin is unavailable", () => {
    const scene = defaultScene({ markerLuma: null, seed: 3 });
    const { outcomes } = runPipeline(scene, 60, 45, 0.4);
    const result = expectResult(outcomes[0]);
    expect(result.spin).toBeNull();
    expect(result.spinNote).toMatch(/marker/);
  });

  it("finds the disc while a big object (the thrower) moves in view", () => {
    const scene = defaultScene({
      seed: 11,
      // Bigger than the disc and moving the whole time, like an arm and
      // body at the edge of the frame.
      distractor: { u: 250, v: 380, w: 90, h: 200, vu: -60, vv: 40 },
    });
    const { passes, outcomes } = runPipeline(scene, 60, 45, 0.4);
    expect(passes).toHaveLength(1);
    const result = expectResult(outcomes[0]);
    const trueSpeed = Math.hypot(
      scene.velocity.x,
      scene.velocity.y,
      scene.velocity.z,
    );
    expect(result.speedMps / trueSpeed).toBeGreaterThan(0.95);
    expect(result.speedMps / trueSpeed).toBeLessThan(1.05);
  });

  it("ignores a large object drifting slowly through view", () => {
    const scene = defaultScene({
      discDiameterM: 0.6, // body-sized blob
      start: { x: 0, y: 1.2, z: 2 },
      velocity: { x: 0, y: -1.5, z: 0 },
      markerLuma: null,
    });
    // Tracker still assumes a real disc size (0.211 m).
    const renderer = new SceneRenderer(scene);
    const detW = 180;
    const detH = 320;
    const det = new Uint8Array(detW * detH);
    const detector = new MotionDetector(detW, detH);
    const tracker = new PassTracker(trackerConfigFor(0.211), detW, detH);
    let passes = 0;
    for (let i = 0; i < 90; i++) {
      boxDownsample(renderer.render(i / 60 - 0.3), 360, 2, det, detW, detH);
      const candidates = detector.process(det);
      if (detector.warmedUp)
        passes += tracker.update(i, i / 60, candidates).length;
    }
    expect(passes).toBe(0);
  });
});
