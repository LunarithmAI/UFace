import type { PhotoMetrics, QualityIssue } from "./contracts";

type Result = { metrics: PhotoMetrics; warnings: QualityIssue[] };
let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<
  number,
  {
    resolve: (result: Result) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

export function cancelLandmarks() {
  stopWorker(new DOMException("Photo checks cancelled", "AbortError"));
}
function stopWorker(error: Error) {
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(error);
  }
  pending.clear();
}
export function analyzeLandmarks(bitmap: ImageBitmap): Promise<Result> {
  return new Promise((resolve, reject) => {
    try {
      if (!worker) {
        worker = new Worker("/workers/face-landmarker.js", { type: "module" });
        worker.onmessage = (
          event: MessageEvent<
            Result & { id: number; error?: string; fatal?: boolean }
          >,
        ) => {
          const response = event.data,
            request = pending.get(response.id);
          if (!request) return;
          if (response.fatal) {
            stopWorker(new Error(response.error));
            return;
          }
          clearTimeout(request.timer);
          pending.delete(response.id);
          if (response.error) request.reject(new Error(response.error));
          else
            request.resolve({
              metrics: response.metrics,
              warnings: response.warnings,
            });
        };
        worker.onerror = () =>
          stopWorker(
            new Error(
              "Face checks could not run on this device. Retry with a current Chrome, Edge, Firefox or Safari browser.",
            ),
          );
        worker.onmessageerror = () =>
          stopWorker(
            new Error(
              "Face checks could not run on this device. Please retry.",
            ),
          );
      }
      const id = ++nextId;
      const timer = setTimeout(
        () =>
          stopWorker(
            new Error(
              "Face checks could not run on this device within 30 seconds. Check your connection and retry, or use a current browser.",
            ),
          ),
        30_000,
      );
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, bitmap }, [bitmap]);
    } catch {
      bitmap.close();
      const error = new Error(
        "Face checks could not run on this device. Retry in a current Chrome, Edge, Firefox or Safari browser.",
      );
      stopWorker(error);
      reject(error);
    }
  });
}
