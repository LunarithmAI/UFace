import assert from "node:assert/strict";
import test from "node:test";
import { BodyTooLargeError, readBoundedBody } from "./request-body";

function streamedRequest(chunks: number[][], onCancel = () => {}): Request {
  return new Request("https://uface.example/api/analyze", {
    method: "POST",
    body: new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = chunks.shift();
        if (next) controller.enqueue(Uint8Array.from(next));
        else controller.close();
      },
      cancel: onCancel,
    }),
    duplex: "half",
  } as RequestInit);
}

test("accepts the exact streaming bound without Content-Length and preserves byte order", async () => {
  const request = streamedRequest([[0, 255], [3], [4, 5]]);
  assert.deepEqual(
    await readBoundedBody(request, 5),
    Uint8Array.from([0, 255, 3, 4, 5]),
  );
});

test("rejects an oversized chunked body and cancels further consumption", async () => {
  let cancelled = false;
  const request = streamedRequest(
    [
      [1, 2],
      [3, 4],
      [5, 6],
    ],
    () => {
      cancelled = true;
    },
  );
  // A falsely small header cannot bypass streaming enforcement.
  request.headers.set("Content-Length", "1");
  await assert.rejects(readBoundedBody(request, 3), BodyTooLargeError);
  assert.equal(cancelled, true);
});

test("an aborted pending body read rejects rather than accepting a partial upload", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const request = new Request("https://uface.example/api/analyze", {
    method: "POST",
    signal: controller.signal,
    body: new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    }),
    duplex: "half",
  } as RequestInit);
  const reading = readBoundedBody(request, 10);
  controller.abort();
  await assert.rejects(reading, { name: "AbortError" });
  assert.equal(cancelled, true);
});

test("zero-byte limit permits empty input but rejects any payload", async () => {
  assert.deepEqual(
    await readBoundedBody(streamedRequest([]), 0),
    new Uint8Array(),
  );
  await assert.rejects(
    readBoundedBody(streamedRequest([[1]]), 0),
    BodyTooLargeError,
  );
});
