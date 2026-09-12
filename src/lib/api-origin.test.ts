import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/analyze/route";

test("a preserved external authority does not inherit the internal listening port", async () => {
  const response = await POST(new Request("https://localhost:3001/api/analyze", {
    method: "POST",
    headers: { host: "uface.example", origin: "https://uface.example" },
    body: "not multipart",
  }));
  // Same-origin passes; malformed content is rejected by the next boundary.
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("an origin different from the external authority is forbidden", async () => {
  const response = await POST(new Request("https://localhost:3001/api/analyze", {
    method: "POST",
    headers: { host: "uface.example", origin: "https://other.example" },
    body: "not multipart",
  }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "INVALID_REQUEST");
});
