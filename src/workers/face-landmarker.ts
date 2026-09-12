import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { measureFace } from "../lib/geometry";
import type { PhotoMetrics, QualityIssue } from "../lib/contracts";

let detector: Promise<FaceLandmarker> | undefined;
const ovalIndices = [
  ...new Set(
    FaceLandmarker.FACE_LANDMARKS_FACE_OVAL.flatMap((c) => [c.start, c.end]),
  ),
];
function loadDetector() {
  return (detector ??= FilesetResolver.forVisionTasks(
    new URL("/vendor/mediapipe/wasm", self.location.origin).href,
    true,
  ).then((files) =>
    FaceLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: "/models/face_landmarker.task",
        delegate: "CPU",
      },
      runningMode: "IMAGE",
      numFaces: 2,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    }),
  ));
}
self.onmessage = async (
  event: MessageEvent<{ id: number; bitmap: ImageBitmap }>,
) => {
  const { id, bitmap } = event.data;
  let stage = "load";
  try {
    const faceDetector = await loadDetector();
    stage = "detect";
    const faces = faceDetector.detect(bitmap).faceLandmarks;
    stage = "geometry";
    if (!faces.length)
      throw new Error(
        "No face detected. Retake with one face clearly visible in even light.",
      );
    if (faces.length >= 2)
      throw new Error(
        "More than one face detected. Use a photo of only yourself.",
      );
    const points = faces[0];
    const measured = measureFace(
      points,
      bitmap.width,
      bitmap.height,
      ovalIndices,
    );
    const warnings: QualityIssue[] = [];
    if (measured.bounds.height < bitmap.height * 0.35)
      warnings.push("small-face");
    stage = "exposure";
    if (
      ovalIndices.some(
        (i) =>
          points[i].x < 0.02 ||
          points[i].x > 0.98 ||
          points[i].y < 0.02 ||
          points[i].y > 0.98,
      )
    )
      warnings.push("cropped-face");
    if (Math.abs(measured.rollDegrees) > 10) warnings.push("tilted-photo");
    const canvas = new OffscreenCanvas(64, 64),
      context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      throw new Error(
        "Exposure checks are unavailable. Try a current browser.",
      );
    const b = measured.bounds;
    context.fillStyle = "white";
    context.fillRect(0, 0, 64, 64);
    context.drawImage(bitmap, b.x, b.y, b.width, b.height, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    let total = 0;
    for (let i = 0; i < pixels.length; i += 4)
      total +=
        0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    const meanLuminance = total / (64 * 64);
    if (meanLuminance < 40) warnings.push("dark-photo");
    if (meanLuminance > 220) warnings.push("bright-photo");
    const metrics: PhotoMetrics = {
      version: 1,
      outlineHeightToWidth: measured.outlineHeightToWidth,
      eyeSpacingToWidth: measured.eyeSpacingToWidth,
      rollDegrees: measured.rollDegrees,
      meanLuminance,
    };
    self.postMessage({ id, metrics, warnings });
  } catch (error) {
    self.postMessage({
      id,
      error:
        stage === "geometry" && error instanceof Error
          ? error.message
          : "Face checks could not run on this device. Retry, or use an up-to-date Chrome, Edge, Firefox or Safari browser.",
      fatal: stage !== "geometry",
    });
  } finally {
    bitmap.close();
  }
};
