export class BodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the allowed size");
    this.name = "BodyTooLargeError";
  }
}

/** Content-Length is deliberately not trusted; the streaming byte count is authoritative. */
export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
    throw new RangeError("Invalid body limit");
  request.signal.throwIfAborted();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const cancel = () => {
    void reader.cancel(request.signal.reason).catch(() => undefined);
  };
  request.signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      request.signal.throwIfAborted();
      const { done, value } = await reader.read();
      request.signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        void reader.cancel("Body too large").catch(() => undefined);
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  } finally {
    request.signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
