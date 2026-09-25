import type {
  AnalysisConfig,
  PassOutcome,
  PassPayload,
} from "../analysis/types";

// A saved pass: the exact greyscale frames and metadata the analysis saw,
// so real throws can be replayed through the pipeline off-device.
//
// Layout: "KINETIC1" | uint32 LE header length | UTF-8 JSON header |
//         background frames | pass frames (each width·height bytes).

const MAGIC = "KINETIC1";

interface Header {
  version: 1;
  config: AnalysisConfig;
  outcome: PassOutcome | null;
  payload: Omit<PassPayload, "frames" | "backgroundFrames"> & {
    frames: { t: number; frameIndex: number }[];
    backgroundCount: number;
  };
}

export interface PassRecording {
  payload: PassPayload;
  config: AnalysisConfig;
  outcome: PassOutcome | null;
}

export function encodeRecording(recording: PassRecording): ArrayBuffer {
  const { payload, config, outcome } = recording;
  const header: Header = {
    version: 1,
    config,
    outcome,
    payload: {
      id: payload.id,
      width: payload.width,
      height: payload.height,
      detScale: payload.detScale,
      detection: payload.detection,
      framePeriodUs: payload.framePeriodUs,
      frames: payload.frames.map((f) => ({
        t: f.t,
        frameIndex: f.frameIndex,
      })),
      backgroundCount: payload.backgroundFrames.length,
    },
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const frameSize = payload.width * payload.height;
  const images = [
    ...payload.backgroundFrames,
    ...payload.frames.map((f) => f.data),
  ];
  const out = new Uint8Array(
    MAGIC.length + 4 + headerBytes.length + images.length * frameSize,
  );
  out.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(out.buffer).setUint32(MAGIC.length, headerBytes.length, true);
  let offset = MAGIC.length + 4;
  out.set(headerBytes, offset);
  offset += headerBytes.length;
  for (const image of images) {
    out.set(image, offset);
    offset += frameSize;
  }
  return out.buffer;
}

export function decodeRecording(buffer: ArrayBuffer): PassRecording {
  const bytes = new Uint8Array(buffer);
  const magic = new TextDecoder().decode(bytes.subarray(0, MAGIC.length));
  if (magic !== MAGIC) throw new Error("Not a Kinetic pass recording");
  const headerLength = new DataView(buffer).getUint32(MAGIC.length, true);
  let offset = MAGIC.length + 4;
  const header = JSON.parse(
    new TextDecoder().decode(bytes.subarray(offset, offset + headerLength)),
  ) as Header;
  offset += headerLength;

  const { payload: meta } = header;
  const frameSize = meta.width * meta.height;
  const take = () => {
    const image = bytes.slice(offset, offset + frameSize);
    offset += frameSize;
    return image;
  };
  const backgroundFrames = Array.from({ length: meta.backgroundCount }, take);
  const frames = meta.frames.map((f) => ({ ...f, data: take() }));
  return {
    config: header.config,
    outcome: header.outcome,
    payload: {
      id: meta.id,
      width: meta.width,
      height: meta.height,
      detScale: meta.detScale,
      detection: meta.detection,
      framePeriodUs: meta.framePeriodUs,
      frames,
      backgroundFrames,
    },
  };
}
