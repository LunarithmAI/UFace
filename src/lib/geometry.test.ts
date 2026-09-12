import test from "node:test";
import assert from "node:assert/strict";
import { measureFace, type Point } from "./geometry";

const outline = [0, 1, 2, 3];
function fixture(width: number, height: number, scale = 1, angle = 0) {
  const points: Point[] = Array.from({ length: 478 }, () => ({
    x: 300,
    y: 300,
  }));
  points[0] = { x: 200, y: 150 };
  points[1] = { x: 400, y: 150 };
  points[2] = { x: 400, y: 450 };
  points[3] = { x: 200, y: 450 };
  points[33] = { x: 245, y: 275 };
  points[133] = { x: 255, y: 275 };
  points[263] = { x: 345, y: 275 };
  points[362] = { x: 355, y: 275 };
  return points.map((p) => {
    const x = (p.x - 300) * scale,
      y = (p.y - 300) * scale;
    return {
      x: (300 + x * Math.cos(angle) - y * Math.sin(angle)) / width,
      y: (300 + x * Math.sin(angle) + y * Math.cos(angle)) / height,
    };
  });
}
function close(actual: number, expected: number) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${actual} differs from ${expected}`,
  );
}

test("pixel geometry is invariant to rectangular image normalization", () => {
  const square = measureFace(fixture(600, 600), 600, 600, outline);
  const rectangular = measureFace(fixture(1000, 600), 1000, 600, outline);
  close(square.outlineHeightToWidth, 1.5);
  close(square.eyeSpacingToWidth, 0.5);
  close(rectangular.outlineHeightToWidth, square.outlineHeightToWidth);
  close(rectangular.eyeSpacingToWidth, square.eyeSpacingToWidth);
});
test("isotropic scaling and rigid rotation preserve leveled ratios", () => {
  const result = measureFace(
    fixture(1000, 800, 1.5, Math.PI / 6),
    1000,
    800,
    outline,
  );
  close(result.outlineHeightToWidth, 1.5);
  close(result.eyeSpacingToWidth, 0.5);
  close(result.rollDegrees, 30);
});
test("incomplete and nonfinite landmarks reject", () => {
  assert.throws(() =>
    measureFace(fixture(600, 600).slice(0, 477), 600, 600, outline),
  );
  const invalid = fixture(600, 600);
  invalid[100].x = NaN;
  assert.throws(() => measureFace(invalid, 600, 600, outline));
});
test("degenerate outlines and coincident eyes reject instead of emitting ratios", () => {
  const flat = fixture(600, 600);
  for (const i of outline) flat[i].x = 0.5;
  assert.throws(() => measureFace(flat, 600, 600, outline));
  const noEyes = fixture(600, 600);
  noEyes[263] = noEyes[33];
  noEyes[362] = noEyes[133];
  assert.throws(() => measureFace(noEyes, 600, 600, outline));
});
