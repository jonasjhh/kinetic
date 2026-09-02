// Draws the current video frame into a fixed-size canvas using "cover"
// scaling — matching the CSS `object-fit: cover` used for the on-screen
// preview — so whatever the user sees while framing a shot is exactly what
// gets measured. A naive full-frame stretch would silently distort the
// image (and the pinhole math built on it) whenever the camera's native
// aspect ratio doesn't exactly match the processing canvas's.
export function drawVideoFrameCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  const srcWidth = video.videoWidth || width;
  const srcHeight = video.videoHeight || height;
  const scale = Math.max(width / srcWidth, height / srcHeight);
  const drawWidth = srcWidth * scale;
  const drawHeight = srcHeight * scale;
  const dx = (width - drawWidth) / 2;
  const dy = (height - drawHeight) / 2;
  ctx.drawImage(video, dx, dy, drawWidth, drawHeight);
}
