import assert from "node:assert/strict";
import test from "node:test";
import { AnalysisLimiter, configuredDailyLimit } from "./analysis-limit.server";

const noon = new Date("2026-09-12T12:00:00.000Z");

test("two in flight block a third; release restores exactly one slot", () => {
  const limiter = new AnalysisLimiter();
  const first = limiter.acquire(10, noon);
  const second = limiter.acquire(10, noon);
  assert.ok(first.allowed && second.allowed);
  assert.deepEqual(limiter.acquire(10, noon), {
    allowed: false,
    reason: "busy",
    retryAfter: 30,
  });
  first.release();
  first.release();
  const third = limiter.acquire(10, noon);
  assert.ok(third.allowed);
  assert.deepEqual(limiter.acquire(10, noon), {
    allowed: false,
    reason: "busy",
    retryAfter: 30,
  });
  second.release();
  third.release();
});

test("busy requests do not spend attempts; completed or failed upstream attempts do", () => {
  const limiter = new AnalysisLimiter();
  const first = limiter.acquire(3, noon);
  const second = limiter.acquire(3, noon);
  assert.ok(first.allowed && second.allowed);
  assert.equal(limiter.acquire(3, noon).allowed, false);
  first.release();
  const third = limiter.acquire(3, noon);
  assert.ok(third.allowed);
  third.release();
  second.release();
  assert.deepEqual(limiter.acquire(3, noon), {
    allowed: false,
    reason: "daily",
    retryAfter: 43200,
  });
});

test("UTC midnight resets attempts but does not release outstanding requests", () => {
  const limiter = new AnalysisLimiter();
  const before = new Date("2026-09-12T23:59:59.500Z");
  const after = new Date("2026-09-13T00:00:00.000Z");
  const first = limiter.acquire(2, before);
  const second = limiter.acquire(2, before);
  assert.ok(first.allowed && second.allowed);
  assert.deepEqual(limiter.acquire(2, before), {
    allowed: false,
    reason: "daily",
    retryAfter: 1,
  });
  assert.deepEqual(limiter.acquire(2, after), {
    allowed: false,
    reason: "busy",
    retryAfter: 30,
  });
  first.release();
  const next = limiter.acquire(2, after);
  assert.ok(next.allowed);
  second.release();
  const last = limiter.acquire(2, after);
  assert.ok(last.allowed);
  next.release();
  last.release();
  assert.deepEqual(limiter.acquire(2, after), {
    allowed: false,
    reason: "daily",
    retryAfter: 86400,
  });
});

test("invalid configured limits disable analysis instead of removing its cap", () => {
  for (const value of [
    "",
    "0",
    "-1",
    "1.5",
    "NaN",
    "Infinity",
    " 5 ",
    "9007199254740992",
  ]) {
    assert.equal(configuredDailyLimit(value), null);
  }
  assert.equal(configuredDailyLimit("12"), 12);
});
