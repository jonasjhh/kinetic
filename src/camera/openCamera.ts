// Opens the rear main camera. 60 fps is first requested as a hard minimum
// (Chrome on Android otherwise often settles on 30), then as a preference,
// then any camera at all.
const BASE_VIDEO: MediaTrackConstraints = {
  facingMode: { ideal: "environment" },
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

const ATTEMPTS: MediaStreamConstraints[] = [
  { audio: false, video: { ...BASE_VIDEO, frameRate: { min: 50, ideal: 60 } } },
  { audio: false, video: { ...BASE_VIDEO, frameRate: { ideal: 60 } } },
  { audio: false, video: true },
];

export async function openCamera(): Promise<MediaStream> {
  let lastError: unknown = null;
  for (const constraints of ATTEMPTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
      const name = err instanceof Error ? err.name : "";
      // Permission problems won't be fixed by asking for less.
      if (name === "NotAllowedError" || name === "SecurityError") throw err;
    }
  }
  throw lastError;
}
