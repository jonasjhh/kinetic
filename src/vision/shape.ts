import type { BlobStats } from "./components";

// Second-order image moments of a blob, reduced to an equivalent ellipse.
// For a uniformly filled ellipse the variance along an axis is
// (semi-axis)² / 4, so a full axis length is 4·sqrt(variance).
//
// A disc smeared by motion blur is a "stadium": a circle of diameter d
// swept along the motion by the blur length b. Its variance across the
// motion is still d²/16, so the width measured perpendicular to the motion
// (widthAcross) recovers the true diameter regardless of blur — unlike the
// major axis, which grows to sqrt(d² + 4b²/3).
export interface Shape {
  cx: number;
  cy: number;
  varXX: number;
  varYY: number;
  varXY: number;
  major: number;
  minor: number;
  angle: number; // orientation of the major axis, radians
}

export function shapeFromSums(
  count: number,
  sumX: number,
  sumY: number,
  sumXX: number,
  sumYY: number,
  sumXY: number,
): Shape {
  const cx = sumX / count;
  const cy = sumY / count;
  const varXX = sumXX / count - cx * cx;
  const varYY = sumYY / count - cy * cy;
  const varXY = sumXY / count - cx * cy;
  const trace = varXX + varYY;
  const diff = varXX - varYY;
  const disc = Math.sqrt(diff * diff + 4 * varXY * varXY);
  const l1 = (trace + disc) / 2;
  const l2 = (trace - disc) / 2;
  return {
    cx,
    cy,
    varXX,
    varYY,
    varXY,
    major: 4 * Math.sqrt(Math.max(l1, 0)),
    minor: 4 * Math.sqrt(Math.max(l2, 0)),
    angle: 0.5 * Math.atan2(2 * varXY, diff),
  };
}

export function blobShape(blob: BlobStats): Shape {
  return shapeFromSums(
    blob.count,
    blob.sumX,
    blob.sumY,
    blob.sumXX,
    blob.sumYY,
    blob.sumXY,
  );
}

/** Full width of the shape perpendicular to the unit direction (dirX, dirY). */
export function widthAcross(shape: Shape, dirX: number, dirY: number): number {
  const nx = -dirY;
  const ny = dirX;
  const variance =
    nx * nx * shape.varXX + 2 * nx * ny * shape.varXY + ny * ny * shape.varYY;
  return 4 * Math.sqrt(Math.max(variance, 0));
}

export function touchesImageEdge(
  blob: BlobStats,
  width: number,
  height: number,
): boolean {
  return (
    blob.minX === 0 ||
    blob.minY === 0 ||
    blob.maxX === width - 1 ||
    blob.maxY === height - 1
  );
}
