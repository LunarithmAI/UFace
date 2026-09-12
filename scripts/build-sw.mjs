import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, relative, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const staticRoot = resolve(root, ".next/static");
const extensions = new Set([
  ".js",
  ".css",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
  ".svg",
  ".ico",
]);
async function enumerate(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await enumerate(path)));
    else if (entry.isFile() && extensions.has(extname(entry.name)))
      paths.push(
        `/_next/static/${relative(staticRoot, path).split(sep).join("/")}`,
      );
  }
  return paths;
}
const buildId = (
  await readFile(resolve(root, ".next/BUILD_ID"), "utf8")
).trim();
if (!buildId || !/^[\w-]+$/.test(buildId))
  throw new Error(
    "Missing or invalid Next build ID. Run next build before generating the service worker.",
  );
const publicPaths = [
  "/",
  "/quiz",
  "/app",
  "/privacy",
  "/terms",
  "/manifest.webmanifest",
  "/uface-mark.svg",
  "/face-study.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];
const assets = await enumerate(staticRoot);
if (!assets.some((path) => path.endsWith(".js")))
  throw new Error(
    "No Next JavaScript assets found; refusing to generate an incomplete offline shell.",
  );
const precache = [...new Set([...publicPaths, ...assets])].sort();
const template = await readFile(
  resolve(root, "src/pwa/sw-template.js"),
  "utf8",
);
const source = template
  .replace("__UFACE_CACHE_NAME__", JSON.stringify(`uface-${buildId}`))
  .replace("__UFACE_PRECACHE__", JSON.stringify(precache, null, 2));
await writeFile(resolve(root, "public/sw.js"), source);
console.log(
  `UFace offline shell generated: ${precache.length} public resources, build ${buildId}.`,
);
