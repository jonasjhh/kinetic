// Chromium's MediaStreamTrackProcessor (mediacapture-transform), not yet in
// TypeScript's DOM lib. Turns a camera track into a stream of VideoFrames,
// each carrying its capture timestamp.
interface MediaStreamTrackProcessorInit {
  track: MediaStreamTrack;
  maxBufferSize?: number;
}

declare class MediaStreamTrackProcessor {
  constructor(init: MediaStreamTrackProcessorInit);
  readonly readable: ReadableStream<VideoFrame>;
}
