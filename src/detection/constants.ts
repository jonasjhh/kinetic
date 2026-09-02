// Every frame — live detection and calibration alike — is downsampled to
// this fixed size before analysis, so a focal length measured once during
// calibration stays valid for every later scan regardless of the camera's
// native resolution. 16:9 to match the ideal camera constraint requested in
// useCamera.ts.
export const PROCESSING_WIDTH = 320;
export const PROCESSING_HEIGHT = 180;
