import { describe, expect, it } from "vitest";
import { estimateSpin, wrapAngle, type SpinSample } from "../spin";

function samples(rps: number, times: number[], phase0 = 0.7): SpinSample[] {
  return times.map((t) => ({
    t,
    angle: wrapAngle(phase0 + 2 * Math.PI * rps * t),
    score: 10,
  }));
}

describe("estimateSpin", () => {
  it("resolves spin above the frame-rate Nyquist limit at 60 fps", () => {
    const times = [0, 1, 2, 3, 4, 5].map((k) => k / 60);
    const result = estimateSpin(samples(-22, times), { preferredSign: -1 })!;
    expect(result.revsPerSecond).toBeCloseTo(-22, 2);
    expect(result.rpm).toBeCloseTo(1320, 0);
    expect(result.directionFromAbove).toBe("cw");
  });

  it("uses the throw direction to settle 30 fps aliases", () => {
    const times = [0, 1, 2, 3].map((k) => k / 30);
    // 20 rev/s at 30 fps turns 240° per frame, indistinguishable from
    // −10 rev/s without knowing the direction.
    const result = estimateSpin(samples(20, times), { preferredSign: 1 })!;
    expect(result.revsPerSecond).toBeCloseTo(20, 2);
  });

  it("breaks aliases when frame times are off a regular grid", () => {
    // Variable frame rate; the expected direction is deliberately wrong.
    const times = [0, 0.031, 0.069, 0.1, 0.128];
    const result = estimateSpin(samples(20, times), { preferredSign: -1 })!;
    expect(result.revsPerSecond).toBeCloseTo(20, 2);
  });

  it("cannot break aliases with a dropped frame alone", () => {
    // The remaining frames still sit on the same 1/30s grid.
    const times = [0, 1, 2, 4, 5].map((k) => k / 30);
    const result = estimateSpin(samples(20, times), { preferredSign: 1 })!;
    expect(result.revsPerSecond).toBeCloseTo(20, 2);
    expect(result.confidence).not.toBe("high");
  });

  it("needs at least two marker sightings", () => {
    expect(estimateSpin(samples(15, [0]), { preferredSign: 1 })).toBeNull();
  });
});
