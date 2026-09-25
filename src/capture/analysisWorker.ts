import { analyzePass } from "../analysis/analyzePass";
import type {
  AnalysisConfig,
  PassOutcome,
  PassPayload,
} from "../analysis/types";
import { encodeRecording } from "../recording/passRecording";
import type {
  AnalysisCommand,
  AnalysisEvent,
  AnalyzeRequest,
} from "./messages";
import { workerScope as scope } from "./workerScope";

// Runs the full-resolution analysis of each pass. Kept apart from the
// capture worker so a slow analysis never holds up frame capture.

let config: AnalysisConfig | null = null;
let last: { payload: PassPayload; outcome: PassOutcome } | null = null;

const post = (event: AnalysisEvent, transfer: Transferable[] = []) =>
  scope.postMessage(event, transfer);

scope.onmessage = (e: MessageEvent<AnalysisCommand>) => {
  const msg = e.data;
  switch (msg.type) {
    case "init":
      config = msg.config;
      msg.port.onmessage = (pe: MessageEvent<AnalyzeRequest>) =>
        handlePass(pe.data.payload);
      break;
    case "config":
      config = msg.config;
      break;
    case "exportLastPass": {
      const buffer =
        last && config
          ? encodeRecording({
              payload: last.payload,
              outcome: last.outcome,
              config,
            })
          : null;
      post({ type: "recording", buffer }, buffer ? [buffer] : []);
      break;
    }
  }
};

function handlePass(payload: PassPayload) {
  if (!config) return;
  let outcome: PassOutcome;
  try {
    outcome = analyzePass(payload, config);
  } catch (err) {
    outcome = {
      ok: false,
      reason: `Analysis error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  last = { payload, outcome };
  post({ type: "result", id: payload.id, outcome });
}
