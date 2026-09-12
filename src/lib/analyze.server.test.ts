import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { analyzePhoto, AnalysisError } from "./analyze.server";
import type { AnalysisMetadata } from "./contracts";
import { POST } from "../app/api/analyze/route";

const metadata: AnalysisMetadata = {
  profile: {
    version: 1,
    adultConfirmed: true,
    goals: ["hair"],
    dailyMinutes: 10,
    budget: "minimal",
    experience: "starting",
  },
  metrics: {
    version: 1,
    outlineHeightToWidth: 1.4,
    eyeSpacingToWidth: 0.4,
    rollDegrees: 0,
    meanLuminance: 120,
  },
  warnings: [],
  consent: {
    version: 2,
    provider: "gemini",
    remoteAnalysis: true,
    adultOwnPhoto: true,
  },
};
const retake = {
  status: "retake",
  retakeReason: "Please use a clear frontal photo.",
  summary: "",
  observations: [],
  routine: [],
  limitations: [],
};
const candidate = {
  finishReason: "STOP",
  content: { parts: [{ text: JSON.stringify(retake) }] },
};

function configure(t: TestContext) {
  const keys = [
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "ANALYSIS_DAILY_LIMIT",
  ] as const;
  const previous = keys.map((key) => process.env[key]);
  process.env.GEMINI_API_KEY = "test-only-not-a-key";
  delete process.env.GEMINI_MODEL;
  process.env.ANALYSIS_DAILY_LIMIT = "50";
  t.after(() =>
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    }),
  );
}

test("Gemini refuses blocked or truncated output even when its JSON looks valid", async (t) => {
  configure(t);
  for (const envelope of [
    { promptFeedback: { blockReason: "SAFETY" }, candidates: [candidate] },
    { candidates: [{ ...candidate, finishReason: "MAX_TOKENS" }] },
  ]) {
    const fetchMock = t.mock.method(globalThis, "fetch", async () =>
      Response.json(envelope),
    );
    await assert.rejects(
      analyzePhoto(
        Buffer.from("unused"),
        metadata,
        new AbortController().signal,
      ),
      (error: unknown) =>
        error instanceof AnalysisError &&
        error.code === "AI_INVALID_RESPONSE" &&
        error.status === 502,
    );
    fetchMock.mock.restore();
  }
});

test("Gemini thought parts are excluded from user-facing advice", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      candidates: [
        {
          ...candidate,
          content: {
            parts: [
              { thought: true, text: "Internal reasoning is not advice JSON." },
              ...candidate.content.parts,
            ],
          },
        },
      ],
    }),
  );
  assert.deepEqual(
    await analyzePhoto(
      Buffer.from("unused"),
      metadata,
      new AbortController().signal,
    ),
    { status: "retake", reason: retake.retakeReason },
  );
});

test("Gemini transport failures never expose upstream details", async (t) => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("private upstream payload and credential");
  });
  await assert.rejects(
    analyzePhoto(Buffer.from("unused"), metadata, new AbortController().signal),
    (error: unknown) =>
      error instanceof AnalysisError &&
      error.code === "AI_UNAVAILABLE" &&
      !error.message.includes("private upstream"),
  );
});

test("cached legacy consent cannot authorize a Gemini photo upload", async () => {
  const form = new FormData();
  form.set("photo", new Blob(["unused"], { type: "image/jpeg" }), "photo.jpg");
  form.set(
    "metadata",
    JSON.stringify({
      ...metadata,
      consent: { version: 1, remoteAnalysis: true, adultOwnPhoto: true },
    }),
  );
  const response = await POST(
    new Request("https://uface.example/api/analyze", {
      method: "POST",
      headers: { origin: "https://uface.example" },
      body: form,
    }),
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "CONSENT_REQUIRED");
});
