export type Point = { x: number; y: number };

/** Image-space proportions of the leveled face outline, never clinical measurements. */
export function measureFace(
  landmarks: readonly Point[],
  width: number,
  height: number,
  ovalIndices: readonly number[],
) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    landmarks.length < 478 ||
    ovalIndices.length < 3 ||
    landmarks.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  ) {
    throw new Error(
      "Face landmarks were incomplete. Retake a clear, front-facing photo.",
    );
  }
  const pixel = (index: number): Point => {
    const p = landmarks[index];
    if (!p)
      throw new Error("Face outline was incomplete. Please retake the photo.");
    return { x: p.x * width, y: p.y * height };
  };
  const midpoint = (a: number, b: number): Point => {
    const p = pixel(a),
      q = pixel(b);
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  };
  let left = midpoint(33, 133),
    right = midpoint(263, 362);
  if (left.x > right.x) [left, right] = [right, left];
  const dx = right.x - left.x,
    dy = right.y - left.y;
  const spacing = Math.hypot(dx, dy);
  if (spacing < 1e-6)
    throw new Error(
      "Eye centers could not be distinguished. Retake facing the camera.",
    );
  const roll = Math.atan2(dy, dx),
    cos = Math.cos(roll),
    sin = Math.sin(roll);
  const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let rawMinX = Infinity,
    rawMinY = Infinity,
    rawMaxX = -Infinity,
    rawMaxY = -Infinity;
  for (const index of new Set(ovalIndices)) {
    const p = pixel(index),
      x = p.x - center.x,
      y = p.y - center.y;
    const leveledX = cos * x + sin * y,
      leveledY = -sin * x + cos * y;
    minX = Math.min(minX, leveledX);
    maxX = Math.max(maxX, leveledX);
    minY = Math.min(minY, leveledY);
    maxY = Math.max(maxY, leveledY);
    rawMinX = Math.min(rawMinX, p.x);
    rawMaxX = Math.max(rawMaxX, p.x);
    rawMinY = Math.min(rawMinY, p.y);
    rawMaxY = Math.max(rawMaxY, p.y);
  }
  const ovalWidth = maxX - minX,
    ovalHeight = maxY - minY;
  if (
    ovalWidth < 1e-6 ||
    ovalHeight < 1e-6 ||
    !Number.isFinite(ovalWidth + ovalHeight)
  )
    throw new Error(
      "Face outline could not be measured. Retake in even light.",
    );
  return {
    outlineHeightToWidth: ovalHeight / ovalWidth,
    eyeSpacingToWidth: spacing / ovalWidth,
    rollDegrees: (roll * 180) / Math.PI,
    bounds: {
      x: rawMinX,
      y: rawMinY,
      width: rawMaxX - rawMinX,
      height: rawMaxY - rawMinY,
    },
  };
}
