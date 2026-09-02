import { useEffect, useRef, useState } from "react";

export type CameraStatus = "requesting" | "ready" | "error";

// Requests the rear camera at the highest frame rate the device offers —
// a disc crossing directly overhead is only in frame for a fraction of a
// second, so temporal resolution matters more here than image quality.
// All constraints are "ideal" (soft) rather than hard minimums/exacts, so
// a camera that can't hit them still gets used at whatever it can do,
// instead of getUserMedia rejecting with OverconstrainedError.
const PREFERRED_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 60 },
  },
};

// If the preferred constraints are still somehow rejected (unusual, but
// constraint support varies across devices/browsers), fall back to just
// asking for any camera at all rather than leaving the user stuck.
const FALLBACK_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: true,
};

async function requestCameraStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia(PREFERRED_CONSTRAINTS);
  } catch (err) {
    if (err instanceof Error && err.name === "OverconstrainedError") {
      return navigator.mediaDevices.getUserMedia(FALLBACK_CONSTRAINTS);
    }
    throw err;
  }
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("requesting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await requestCameraStream();
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Camera access was denied.",
        );
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
    };
  }, []);

  return { videoRef, status, error };
}
