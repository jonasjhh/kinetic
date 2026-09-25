import { useEffect, useRef, useState } from "react";
import { openCamera } from "./openCamera";

export type CameraStatus = "requesting" | "ready" | "error";

export interface CameraSettings {
  width: number;
  height: number;
  frameRate: number | null;
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("requesting");
  const [error, setError] = useState<string | null>(null);
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const [settings, setSettings] = useState<CameraSettings | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await openCamera();
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        const videoTrack = stream.getVideoTracks()[0];
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
        const s = videoTrack.getSettings();
        setSettings({
          width: s.width ?? 0,
          height: s.height ?? 0,
          frameRate: s.frameRate ?? null,
        });
        setTrack(videoTrack);
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
        for (const t of stream.getTracks()) t.stop();
      }
      setTrack(null);
    };
  }, []);

  return { videoRef, status, error, track, settings };
}
