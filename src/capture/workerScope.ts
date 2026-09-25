// The app's tsconfig uses the DOM lib, which can't be combined with the
// WebWorker lib in one program; this is the slice of the dedicated-worker
// global the workers use.
export interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
}

export const workerScope = self as unknown as WorkerScope;
