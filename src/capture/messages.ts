import type {
  AnalysisConfig,
  PassOutcome,
  PassPayload,
} from "../analysis/types";

export interface CaptureHealth {
  fps: number; // measured from frame timestamps
  droppedFrames: number; // since the last reset
  totalFrames: number;
  meanLuma: number;
  width: number;
  height: number;
  processingMs: number; // average per-frame work in the capture worker
  source: "track-processor" | "video-frame-callback";
}

export interface OverlayBlob {
  x: number; // 0..1 of image width
  y: number;
  d: number; // 0..1 of image width
}

export interface MarkerCheck {
  discFound: boolean;
  markerScore: number; // ≥ 4 counts as visible
}

// main → capture worker
export type CaptureCommand =
  | {
      type: "init";
      readable: ReadableStream<VideoFrame> | null;
      analysisPort: MessagePort;
      discDiameterM: number;
      source: CaptureHealth["source"];
    }
  | { type: "frame"; frame: VideoFrame }
  | { type: "arm" }
  | { type: "disarm" }
  | { type: "config"; discDiameterM: number }
  | { type: "overlay"; enabled: boolean }
  | { type: "markerCheck" }
  | { type: "brightness"; requestId: number }
  | { type: "resetHealth" };

// capture worker → main
export type CaptureEvent =
  | { type: "health"; health: CaptureHealth }
  | { type: "overlay"; blobs: OverlayBlob[] }
  | { type: "armed" } // background model warmed up; throws will be seen
  | { type: "passDetected"; id: number }
  | { type: "markerCheck"; result: MarkerCheck }
  | { type: "brightness"; requestId: number; meanLuma: number }
  | { type: "error"; message: string };

// main → analysis worker
export type AnalysisCommand =
  | { type: "init"; port: MessagePort; config: AnalysisConfig }
  | { type: "config"; config: AnalysisConfig }
  | { type: "exportLastPass" };

// analysis worker → main
export type AnalysisEvent =
  | { type: "result"; id: number; outcome: PassOutcome }
  | { type: "recording"; buffer: ArrayBuffer | null };

// capture worker → analysis worker, over a dedicated MessageChannel so the
// pass frames never touch the main thread.
export interface AnalyzeRequest {
  type: "analyze";
  payload: PassPayload;
}
