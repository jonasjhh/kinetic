// Renders greyscale frames of a disc flying over an upward-looking pinhole
// camera, with exposure blur, a spinning radial marker strip and sensor
// noise. Used by the tests to check the pipeline against known truth.

export interface SceneConfig {
  width: number;
  height: number;
  focalLengthPx: number;
  discDiameterM: number;
  start: { x: number; y: number; z: number }; // metres at t = 0
  velocity: { x: number; y: number; z: number }; // m/s
  // Image-convention rate (positive = clockwise on screen).
  spinRps: number;
  exposureS: number;
  discLuma: number;
  markerLuma: number | null; // null = no marker
  markerWidthM: number;
  noise: number; // uniform noise amplitude
  seed: number;
  // A dark rectangle moving in pixel units (e.g. the thrower's arm/body).
  distractor: {
    u: number;
    v: number;
    w: number;
    h: number;
    vu: number; // px/s
    vv: number;
  } | null;
  // Things a phone lying still still sees: frame-to-frame brightness
  // jitter, rolling light-flicker bands, and small twinkling specks
  // (sensor noise clusters, leaves, insects).
  clutter: {
    gainJitter: number; // ± fraction per frame
    bandAmplitude: number; // ± fraction
    bandPeriodPx: number;
    bandSpeedPxPerS: number;
    specksPerFrame: number;
    speckSizePx: number;
  } | null;
}

export function defaultScene(
  overrides: Partial<SceneConfig> = {},
): SceneConfig {
  return {
    width: 360,
    height: 640,
    focalLengthPx: 466,
    discDiameterM: 0.211,
    start: { x: 0.15, y: 1.9, z: 2 },
    velocity: { x: -1.5, y: -25, z: 1.2 },
    spinRps: -18,
    exposureS: 0.001,
    discLuma: 60,
    markerLuma: 215,
    markerWidthM: 0.02,
    noise: 3,
    seed: 1,
    distractor: null,
    clutter: null,
    ...overrides,
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SceneRenderer {
  private config: SceneConfig;
  private base: Float32Array;
  private random: () => number;

  constructor(config: SceneConfig) {
    this.config = config;
    this.random = mulberry32(config.seed);
    const { width, height } = config;
    // Sky: vertical gradient plus soft cloud texture.
    this.base = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cloud =
          10 * Math.sin(x / 37 + y / 53) * Math.cos(y / 29 - x / 71) +
          6 * Math.sin((x + 2 * y) / 19);
        this.base[y * width + x] = 165 + (25 * y) / height + cloud;
      }
    }
  }

  /** Frame whose exposure starts at time t (seconds). */
  render(t: number): Uint8Array {
    const c = this.config;
    const { width, height } = c;
    const out = new Float32Array(this.base);

    const subSamples = 8;
    const R = c.discDiameterM / 2;
    const discs = [];
    for (let s = 0; s < subSamples; s++) {
      const ts = t + ((s + 0.5) / subSamples) * c.exposureS;
      const X = c.start.x + c.velocity.x * ts;
      const Y = c.start.y + c.velocity.y * ts;
      const Z = c.start.z + c.velocity.z * ts;
      discs.push({
        u: (width - 1) / 2 + (c.focalLengthPx * X) / Z,
        v: (height - 1) / 2 + (c.focalLengthPx * Y) / Z,
        r: (c.focalLengthPx * R) / Z,
        theta: 2 * Math.PI * c.spinRps * ts,
        halfStripPx: (c.focalLengthPx * c.markerWidthM) / 2 / Z,
      });
    }

    const minU = Math.max(
      0,
      Math.floor(Math.min(...discs.map((d) => d.u - d.r)) - 1),
    );
    const maxU = Math.min(
      width - 1,
      Math.ceil(Math.max(...discs.map((d) => d.u + d.r)) + 1),
    );
    const minV = Math.max(
      0,
      Math.floor(Math.min(...discs.map((d) => d.v - d.r)) - 1),
    );
    const maxV = Math.min(
      height - 1,
      Math.ceil(Math.max(...discs.map((d) => d.v + d.r)) + 1),
    );

    for (let y = minV; y <= maxV; y++) {
      for (let x = minU; x <= maxU; x++) {
        let covered = 0;
        let value = 0;
        for (const d of discs) {
          // 2×2 spatial supersampling per time sample.
          for (let sy = 0; sy < 2; sy++) {
            for (let sx = 0; sx < 2; sx++) {
              const px = x - 0.25 + 0.5 * sx - d.u;
              const py = y - 0.25 + 0.5 * sy - d.v;
              const rho = Math.hypot(px, py);
              if (rho > d.r) continue;
              covered++;
              value += this.discValue(px, py, rho, d);
            }
          }
        }
        if (covered === 0) continue;
        const total = discs.length * 4;
        const i = y * width + x;
        out[i] = out[i] * (1 - covered / total) + value / total;
      }
    }

    if (c.distractor) {
      const d = c.distractor;
      const u0 = Math.round(d.u + d.vu * t);
      const v0 = Math.round(d.v + d.vv * t);
      for (let y = Math.max(0, v0); y < Math.min(height, v0 + d.h); y++) {
        for (let x = Math.max(0, u0); x < Math.min(width, u0 + d.w); x++) {
          out[y * width + x] = 45 + 10 * Math.sin(x / 5);
        }
      }
    }

    if (c.clutter) {
      const k = c.clutter;
      const gain = 1 + (this.random() * 2 - 1) * k.gainJitter;
      for (let y = 0; y < height; y++) {
        const band =
          1 +
          k.bandAmplitude *
            Math.sin(
              (2 * Math.PI * (y - k.bandSpeedPxPerS * t)) / k.bandPeriodPx,
            );
        const row = y * width;
        for (let x = 0; x < width; x++) out[row + x] *= gain * band;
      }
      for (let n = 0; n < k.specksPerFrame; n++) {
        const u0 = Math.floor(this.random() * (width - k.speckSizePx));
        const v0 = Math.floor(this.random() * (height - k.speckSizePx));
        const delta =
          (this.random() < 0.5 ? -1 : 1) * (30 + 50 * this.random());
        for (let y = v0; y < v0 + k.speckSizePx; y++) {
          for (let x = u0; x < u0 + k.speckSizePx; x++)
            out[y * width + x] += delta;
        }
      }
    }

    const frame = new Uint8Array(width * height);
    for (let i = 0; i < out.length; i++) {
      const v = out[i] + (this.random() * 2 - 1) * c.noise;
      frame[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
    }
    return frame;
  }

  private discValue(
    px: number,
    py: number,
    rho: number,
    d: { r: number; theta: number; halfStripPx: number },
  ): number {
    const c = this.config;
    if (c.markerLuma === null) return c.discLuma;
    if (rho < 0.12 * d.r || rho > 0.95 * d.r) return c.discLuma;
    // Distance from the strip's centre line (a ray at angle theta).
    const along = px * Math.cos(d.theta) + py * Math.sin(d.theta);
    if (along <= 0) return c.discLuma;
    const across = Math.abs(-px * Math.sin(d.theta) + py * Math.cos(d.theta));
    return across <= d.halfStripPx ? c.markerLuma : c.discLuma;
  }
}
