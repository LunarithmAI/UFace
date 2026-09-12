import {
  mkdir,
  readFile,
  writeFile,
  cp,
  rename,
  access,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const at = (...parts) => resolve(root, ...parts);
const modelUrl =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const modelPath = at("public/models/face_landmarker.task");
const lockPath = at("model-assets.lock.json");
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

try {
  await Promise.all(
    [
      "public/vendor/mediapipe",
      "public/models",
      "public/workers",
      "public/icons",
    ].map((path) => mkdir(at(path), { recursive: true })),
  );
  const vision = at("node_modules/@mediapipe/tasks-vision");
  const installed = JSON.parse(
    await readFile(resolve(vision, "package.json"), "utf8"),
  );
  if (installed.version !== "1.0.1")
    throw new Error(
      "Expected @mediapipe/tasks-vision 1.0.1. Run npm install using the project lockfile.",
    );
  await Promise.all([
    cp(
      resolve(vision, "vision_bundle.mjs"),
      at("public/vendor/mediapipe/vision_bundle.mjs"),
    ),
    cp(resolve(vision, "wasm"), at("public/vendor/mediapipe/wasm"), {
      recursive: true,
    }),
  ]);
  const lock = (await exists(lockPath))
    ? JSON.parse(await readFile(lockPath, "utf8"))
    : null;
  if (lock && (lock.url !== modelUrl || !/^[a-f0-9]{64}$/.test(lock.sha256)))
    throw new Error(
      "Invalid model-assets.lock.json; refusing to change the pinned model.",
    );
  let bytes;
  const cached = await exists(modelPath);
  if (cached) bytes = await readFile(modelPath);
  else {
    const response = await fetch(modelUrl, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok)
      throw new Error(
        `Model download failed (${response.status}) from ${modelUrl}`,
      );
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (bytes.length < 1_000_000)
    throw new Error("Downloaded model is unexpectedly small; setup stopped.");
  const sha256 = digest(bytes);
  if (lock && sha256 !== lock.sha256)
    throw new Error(
      "Face model checksum mismatch. Remove the generated model and retry; do not change the lock to bypass this failure.",
    );
  if (!lock)
    await writeFile(
      lockPath,
      `${JSON.stringify({ url: modelUrl, sha256 }, null, 2)}\n`,
      { flag: "wx" },
    );
  if (!cached) {
    await writeFile(`${modelPath}.download`, bytes);
    await rename(`${modelPath}.download`, modelPath);
  }
  await build({
    entryPoints: [at("src/workers/face-landmarker.ts")],
    outfile: at("public/workers/face-landmarker.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    plugins: [
      {
        name: "same-origin-mediapipe",
        setup(builder) {
          builder.onResolve({ filter: /^@mediapipe\/tasks-vision$/ }, () => ({
            path: "/vendor/mediapipe/vision_bundle.mjs",
            external: true,
          }));
        },
      },
    ],
  });
  const mark = await readFile(at("public/uface-mark.svg"));
  await Promise.all(
    [192, 512, 180].map((size) =>
      sharp(mark)
        .resize(size, size)
        .png()
        .toFile(
          at(
            `public/icons/${size === 180 ? "apple-touch-icon" : `icon-${size}`}.png`,
          ),
        ),
    ),
  );
  const safeMark = await sharp(mark).resize(308, 308).png().toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: "#1b192e" },
  })
    .composite([{ input: safeMark, left: 102, top: 102 }])
    .png()
    .toFile(at("public/icons/icon-maskable-512.png"));
  console.log(`UFace assets ready. Face model SHA-256: ${sha256}`);
} catch (error) {
  console.error(
    "UFace asset preparation failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
