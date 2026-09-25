import { describe, expect, it } from "vitest";
import { fitKinematics, type KinematicSample } from "../kinematics";

const f = 500;
const D = 0.211;
const cu = 180;
const cv = 320;

function project(
  t: number,
  start: [number, number, number],
  v: [number, number, number],
): KinematicSample {
  const X = start[0] + v[0] * t;
  const Y = start[1] + v[1] * t;
  const Z = start[2] + v[2] * t;
  return {
    t,
    u: cu + (f * X) / Z,
    v: cv + (f * Y) / Z,
    d: (f * D) / Z,
    sigmaD: 0.5,
    weight: 1,
  };
}

describe("fitKinematics", () => {
  it("recovers horizontal velocity exactly, even while height changes", () => {
    const samples = [0, 1, 2, 3, 4].map((k) =>
      project(k / 60, [0.3, 1.2, 1.8], [2, -24, 3]),
    );
    const fit = fitKinematics(samples, {
      cu,
      cv,
      focalLengthPx: f,
      discDiameterM: D,
    })!;
    // Exact up to the small shrinkage the vz prior applies to 1/d.
    expect(fit.vx).toBeCloseTo(2, 2);
    expect(fit.vy / -24).toBeCloseTo(1, 3);
    // vz is shrunk slightly by its prior but stays close.
    expect(fit.vz).toBeGreaterThan(2.7);
    expect(fit.vz).toBeLessThan(3.05);
    expect(fit.headingDeg).toBeCloseTo((Math.atan2(2, 24) * 180) / Math.PI, 1);
  });

  it("does not need the focal length for horizontal speed", () => {
    const samples = [0, 1, 2].map((k) =>
      project(k / 30, [0, 1, 2], [0, -30, 0]),
    );
    const wrongF = fitKinematics(samples, {
      cu,
      cv,
      focalLengthPx: f * 1.3,
      discDiameterM: D,
    })!;
    expect(wrongF.horizontalSpeedMps).toBeCloseTo(30, 6);
  });

  it("works from two frames", () => {
    const samples = [0, 1].map((k) => project(k / 60, [0, 1, 2], [0, -20, 0]));
    const fit = fitKinematics(samples, {
      cu,
      cv,
      focalLengthPx: f,
      discDiameterM: D,
    })!;
    expect(fit.speedMps).toBeCloseTo(20, 4);
  });
});
