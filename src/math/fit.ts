export interface LineFit {
  intercept: number; // value at t = 0
  slope: number;
  rms: number; // weighted RMS residual
}

/** Weighted least-squares straight line v = intercept + slope·t. */
export function fitLine(t: number[], v: number[], weights?: number[]): LineFit {
  const n = t.length;
  let sw = 0;
  let st = 0;
  let sv = 0;
  for (let i = 0; i < n; i++) {
    const w = weights ? weights[i] : 1;
    sw += w;
    st += w * t[i];
    sv += w * v[i];
  }
  const tMean = st / sw;
  const vMean = sv / sw;
  let stt = 0;
  let stv = 0;
  for (let i = 0; i < n; i++) {
    const w = weights ? weights[i] : 1;
    const dt = t[i] - tMean;
    stt += w * dt * dt;
    stv += w * dt * (v[i] - vMean);
  }
  const slope = stt > 0 ? stv / stt : 0;
  const intercept = vMean - slope * tMean;
  let sr = 0;
  for (let i = 0; i < n; i++) {
    const w = weights ? weights[i] : 1;
    const r = v[i] - intercept - slope * t[i];
    sr += w * r * r;
  }
  return { intercept, slope, rms: Math.sqrt(sr / sw) };
}
