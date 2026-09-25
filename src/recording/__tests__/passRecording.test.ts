import { describe, expect, it } from "vitest";
import type { PassPayload } from "../../analysis/types";
import { decodeRecording, encodeRecording } from "../passRecording";

describe("pass recording", () => {
  it("round-trips frames and metadata", () => {
    const frame = (v: number) => new Uint8Array(12).fill(v);
    const payload: PassPayload = {
      id: 3,
      width: 4,
      height: 3,
      detScale: 2,
      frames: [
        { t: 1000, frameIndex: 10, data: frame(7) },
        { t: 17667, frameIndex: 11, data: frame(9) },
      ],
      backgroundFrames: [frame(1)],
      detection: {
        points: [],
        firstFrame: 10,
        lastFrame: 11,
        diameterPx: 5,
        diametersPerSecond: 100,
      },
      framePeriodUs: 16667,
    };
    const config = {
      discDiameterM: 0.211,
      fovLongSideDeg: 69,
      throwType: "rhbh" as const,
    };
    const decoded = decodeRecording(
      encodeRecording({ payload, config, outcome: null }),
    );
    expect(decoded.config).toEqual(config);
    expect(decoded.payload.frames.map((f) => f.data[0])).toEqual([7, 9]);
    expect(decoded.payload.frames[1].t).toBe(17667);
    expect(decoded.payload.backgroundFrames[0][5]).toBe(1);
    expect(decoded.payload.detection.diameterPx).toBe(5);
  });
});
