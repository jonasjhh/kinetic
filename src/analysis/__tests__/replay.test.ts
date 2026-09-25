import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeRecording } from "../../recording/passRecording";
import { analyzePass } from "../analyzePass";

// Replays real passes saved from the app (see recordings/README.md).
const dir = join(process.cwd(), "recordings");
const files = readdirSync(dir).filter((f) => f.endsWith(".kinetic"));

describe.skipIf(files.length === 0)("recorded passes", () => {
  for (const file of files) {
    it(`analyses ${file}`, () => {
      const buffer = readFileSync(join(dir, file));
      const recording = decodeRecording(
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ),
      );
      const outcome = analyzePass(recording.payload, recording.config);
      console.log(file, JSON.stringify(outcome, null, 2));
      expect(outcome).toBeDefined();
    });
  }
});
