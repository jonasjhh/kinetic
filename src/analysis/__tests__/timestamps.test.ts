import { describe, expect, it } from "vitest";
import { regularizeTimestamps } from "../timestamps";

describe("regularizeTimestamps", () => {
  it("snaps jittery timestamps to the frame grid, including a dropped frame", () => {
    const period = 16_667;
    const jitter = [0, 900, -700, 400, -300];
    const index = [0, 1, 2, 4, 5];
    const raw = index.map((n, i) => 5_000_000 + n * period + jitter[i]);
    const t = regularizeTimestamps(raw, null);
    index.forEach((n, i) => {
      expect(t[i]).toBeCloseTo((n * period) / 1e6, 3);
    });
  });

  it("keeps raw times when frames are not on a regular grid", () => {
    const raw = [0, 10_000, 31_000, 40_000, 70_000];
    const t = regularizeTimestamps(raw, 16_667);
    expect(t).toEqual(raw.map((v) => v / 1e6));
  });
});
