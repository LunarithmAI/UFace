import sharp from "sharp";
import { AnalysisMetadataSchema, type ApiError } from "../../../lib/contracts";
import { AnalysisError, analyzePhoto } from "../../../lib/analyze.server";
import { BodyTooLargeError, readBoundedBody } from "../../../lib/request-body";

export const runtime = "nodejs";
const MAX_BODY = 4 * 1024 * 1024;
const MAX_PHOTO = 3 * 1024 * 1024;

function json(body: unknown, status = 200, retryAfter?: number): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfter !== undefined) headers["Retry-After"] = String(retryAfter);
  return Response.json(body, { status, headers });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function validatedJpeg(photo: File): Promise<Buffer> {
  if (photo.size > MAX_PHOTO)
    throw new AnalysisError(
      413,
      "IMAGE_TOO_LARGE",
      "The normalized photo must be 3 MiB or smaller.",
    );
  if (photo.size === 0)
    throw new AnalysisError(
      415,
      "INVALID_IMAGE",
      "The photo is empty. Please choose another image.",
    );
  try {
    const input = Buffer.from(await photo.arrayBuffer());
    const image = sharp(input, {
      limitInputPixels: 24_000_000,
      failOn: "warning",
    });
    const info = await image.metadata();
    if (
      info.format !== "jpeg" ||
      (info.pages ?? 1) !== 1 ||
      !info.width ||
      !info.height ||
      info.width < 256 ||
      info.height < 256 ||
      info.width > 1280 ||
      info.height > 1280
    ) {
      throw new AnalysisError(
        415,
        "INVALID_IMAGE",
        "Use a normalized single-frame JPEG between 256 and 1280 pixels on each side.",
      );
    }
    // Sharp strips EXIF and other metadata by default. Decode fully before contacting the provider.
    const jpeg = await image.jpeg({ quality: 90 }).toBuffer();
    if (jpeg.byteLength > MAX_PHOTO)
      throw new AnalysisError(
        413,
        "IMAGE_TOO_LARGE",
        "The normalized photo must be 3 MiB or smaller.",
      );
    return jpeg;
  } catch (error) {
    if (error instanceof AnalysisError) throw error;
    throw new AnalysisError(
      415,
      "INVALID_IMAGE",
      "This photo could not be decoded safely. Please choose another JPEG.",
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    // Next reconstructs request.url using its listening hostname. Restore the
    // original HTTP authority; the deployment proxy must preserve Host and scheme.
    const requestUrl = new URL(request.url);
    const authority = request.headers.get("host");
    const expectedOrigin = authority
      ? new URL(`${requestUrl.protocol}//${authority}`).origin
      : requestUrl.origin;
    if (request.headers.get("origin") !== expectedOrigin) {
      throw new AnalysisError(
        403,
        "INVALID_REQUEST",
        "Analysis requests must originate from this UFace site.",
      );
    }
    let body: Uint8Array<ArrayBuffer>;
    try {
      body = await readBoundedBody(request, MAX_BODY);
    } catch (error) {
      if (error instanceof BodyTooLargeError)
        throw new AnalysisError(
          413,
          "IMAGE_TOO_LARGE",
          "The upload exceeds the 4 MiB request limit.",
        );
      throw new AnalysisError(
        400,
        "INVALID_REQUEST",
        "The upload was interrupted or could not be read.",
      );
    }
    const contentType = request.headers.get("content-type") ?? "";
    if (!/^multipart\/form-data(?:;|$)/i.test(contentType))
      throw new AnalysisError(
        400,
        "INVALID_REQUEST",
        "Send a multipart photo and metadata upload.",
      );
    let form: FormData;
    try {
      form = await new Response(body, {
        headers: { "Content-Type": contentType },
      }).formData();
    } catch {
      throw new AnalysisError(
        400,
        "INVALID_REQUEST",
        "The multipart upload could not be read.",
      );
    }
    const fields = [...form.keys()];
    const photo = form.get("photo");
    const rawMetadata = form.get("metadata");
    if (
      fields.length !== 2 ||
      form.getAll("photo").length !== 1 ||
      form.getAll("metadata").length !== 1 ||
      !(photo instanceof File) ||
      typeof rawMetadata !== "string"
    ) {
      throw new AnalysisError(
        400,
        "INVALID_REQUEST",
        "Include exactly one photo file and one metadata JSON field.",
      );
    }
    let metadata: unknown;
    try {
      metadata = JSON.parse(rawMetadata);
    } catch {
      throw new AnalysisError(
        400,
        "INVALID_REQUEST",
        "The metadata must be valid JSON.",
      );
    }
    if (!isObject(metadata))
      throw new AnalysisError(
        400,
        "INVALID_REQUEST",
        "The metadata must be a JSON object.",
      );
    if (
      !isObject(metadata.consent) ||
      metadata.consent.version !== 2 ||
      metadata.consent.provider !== "gemini" ||
      metadata.consent.remoteAnalysis !== true ||
      metadata.consent.adultOwnPhoto !== true ||
      !isObject(metadata.profile) ||
      metadata.profile.adultConfirmed !== true
    ) {
      throw new AnalysisError(
        403,
        "CONSENT_REQUIRED",
        "Confirm that you are 18 or older, this is your own photo, and you consent to Google Gemini analysis. If this screen names a different provider, update UFace first.",
      );
    }
    const parsed = AnalysisMetadataSchema.safeParse(metadata);
    if (!parsed.success)
      throw new AnalysisError(
        400,
        "INVALID_REQUEST",
        "The profile or photo-check data is invalid. Please review your answers and select the photo again.",
      );
    const jpeg = await validatedJpeg(photo);
    request.signal.throwIfAborted();
    return json(await analyzePhoto(jpeg, parsed.data, request.signal));
  } catch (error) {
    const safe =
      error instanceof AnalysisError
        ? error
        : new AnalysisError(
            502,
            "AI_UNAVAILABLE",
            "Analysis is unavailable. Please manually retry later.",
          );
    const body: ApiError = {
      error: { code: safe.code, message: safe.message },
    };
    return json(body, safe.status, safe.retryAfter);
  }
}
