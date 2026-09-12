const MIB = 1024 * 1024;

export async function preparePhoto(
  file: File,
): Promise<{ blob: Blob; bitmap: ImageBitmap; width: number; height: number }> {
  if (!file.size)
    throw new Error("This file is empty. Choose a JPEG, PNG or WebP photo.");
  if (file.size > 10 * MIB)
    throw new Error("Choose a photo smaller than 10 MiB.");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!jpeg && !png && !webp)
    throw new Error(
      "Use JPEG, PNG or WebP. If your camera supplied HEIC, export it as JPEG first.",
    );
  if (typeof createImageBitmap !== "function")
    throw new Error(
      "Photo preparation needs a current Chrome, Edge, Firefox or Safari browser.",
    );
  let decoded: ImageBitmap;
  try {
    decoded = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "This photo could not be decoded. Choose an undamaged JPEG, PNG or WebP.",
    );
  }
  try {
    if (
      decoded.width < 256 ||
      decoded.height < 256 ||
      decoded.width * decoded.height > 24_000_000
    )
      throw new Error(
        "Use a photo at least 256 pixels on each side and no larger than 24 megapixels.",
      );
    const scale = Math.min(1, 1280 / Math.max(decoded.width, decoded.height));
    const width = Math.round(decoded.width * scale),
      height = Math.round(decoded.height * scale);
    if (width < 256 || height < 256)
      throw new Error(
        "This photo is too narrow. Choose a less panoramic photo.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Photo preparation is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(
                new Error("Could not prepare this photo. Try another image."),
              ),
        "image/jpeg",
        0.9,
      ),
    );
    if (blob.type !== "image/jpeg" || blob.size > 3 * MIB)
      throw new Error(
        "The prepared photo exceeds 3 MiB. Choose a smaller image.",
      );
    const bitmap = await createImageBitmap(blob);
    return { blob, bitmap, width, height };
  } finally {
    decoded.close();
  }
}
