"use client";

import { useEffect, useRef, useState } from "react";
import {
  ScanSchema,
  type Profile,
  type Scan,
  type PhotoMetrics,
  type QualityIssue,
} from "../lib/contracts";
import { preparePhoto } from "../lib/photo";
import { analyzeLandmarks, cancelLandmarks } from "../lib/landmarker";

type Props = {
  profile: Profile;
  onSuccess: (scan: Scan, photo: Blob, savePhoto: boolean) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  generation: number;
};
type Photo = { blob: Blob; url: string };
const warningLabels: Record<QualityIssue, string> = {
  "small-face": "Your face is small in the frame. Move closer.",
  "cropped-face":
    "The face outline is near the edge. Leave space around your face.",
  "tilted-photo": "The photo is tilted. Level the camera.",
  "dark-photo": "The face area is dark. Use more even light.",
  "bright-photo": "The face area is bright. Avoid harsh direct light.",
};

export default function ScanCapture({
  profile,
  onSuccess,
  onBusyChange,
  generation,
}: Props) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [checks, setChecks] = useState<{
    metrics: PhotoMetrics;
    warnings: QualityIssue[];
  } | null>(null);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [adult, setAdult] = useState(false),
    [remote, setRemote] = useState(false),
    [savePhoto, setSavePhoto] = useState(false),
    [acknowledged, setAcknowledged] = useState(false);
  const [offline, setOffline] = useState(false);
  const sequence = useRef(0),
    controller = useRef<AbortController | null>(null),
    currentPhoto = useRef<Photo | null>(null),
    busy = useRef(false),
    accepted = useRef(false);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  const fileInput = useRef<HTMLInputElement>(null),
    cameraInput = useRef<HTMLInputElement>(null);
  const statusHeading = useRef<HTMLHeadingElement>(null);
  function setBusy(label: string) {
    busy.current = Boolean(label);
    setPhase(label);
    busyCallback.current(Boolean(label));
  }
  function invalidate() {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
    cancelLandmarks();
    if (currentPhoto.current) URL.revokeObjectURL(currentPhoto.current.url);
    currentPhoto.current = null;
    accepted.current = false;
  }
  function reset() {
    invalidate();
    setPhoto(null);
    setChecks(null);
    setReview(false);
    setAdult(false);
    setRemote(false);
    setSavePhoto(false);
    setAcknowledged(false);
    setError("");
    setBusy("");
  }
  useEffect(() => {
    reset();
    return () => {
      invalidate();
      busyCallback.current(false);
    };
    // Generation is the app's deletion barrier, not a callback identity.
  }, [generation]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    if (review) statusHeading.current?.focus();
  }, [review]);
  async function choose(file?: File) {
    if (!file) return;
    reset();
    const token = sequence.current;
    setBusy("Preparing photo");
    try {
      const prepared = await preparePhoto(file);
      if (token !== sequence.current) {
        prepared.bitmap.close();
        return;
      }
      prepared.bitmap.close();
      const value = {
        blob: prepared.blob,
        url: URL.createObjectURL(prepared.blob),
      };
      currentPhoto.current = value;
      setPhoto(value);
      setBusy("");
    } catch (e) {
      if (token === sequence.current) {
        setError(
          e instanceof Error ? e.message : "Could not prepare the photo.",
        );
        setBusy("");
      }
    }
  }
  async function checkPhoto() {
    if (!photo || busy.current) return;
    const token = sequence.current;
    setError("");
    setBusy("Checking face");
    try {
      const bitmap = await createImageBitmap(photo.blob);
      if (token !== sequence.current) {
        bitmap.close();
        return;
      }
      const result = await analyzeLandmarks(bitmap);
      if (token !== sequence.current) return;
      setChecks(result);
      setReview(true);
      setBusy("");
    } catch (e) {
      if (token === sequence.current) {
        setError(
          e instanceof Error
            ? e.message
            : "Face checks could not run on this device. Please retry.",
        );
        setBusy("");
      }
    }
  }
  async function submit() {
    if (
      !photo ||
      !checks ||
      !adult ||
      !remote ||
      (checks.warnings.length > 0 && !acknowledged) ||
      busy.current ||
      accepted.current ||
      !navigator.onLine
    )
      return;
    const token = sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setBusy("Waiting for AI advice");
    try {
      const body = new FormData();
      body.set("photo", photo.blob, "photo.jpg");
      body.set(
        "metadata",
        JSON.stringify({
          profile,
          metrics: checks.metrics,
          warnings: checks.warnings,
          consent: {
            version: 2,
            provider: "gemini",
            remoteAnalysis: true,
            adultOwnPhoto: true,
          },
        }),
      );
      const response = await fetch("/api/analyze", {
        method: "POST",
        body,
        signal: abort.signal,
      });
      const result = await response.json();
      if (token !== sequence.current) return;
      if (!response.ok)
        throw new Error(
          result?.error?.message ||
            "Analysis could not finish. Your photo is still here; retry when ready.",
        );
      if (result.status === "retake" && typeof result.reason === "string") {
        setError(result.reason);
        setBusy("");
        return;
      }
      if (result.status !== "ok")
        throw new Error("The AI response was not usable. Please retry.");
      const scan = ScanSchema.parse(result.scan);
      accepted.current = true;
      setBusy("Saving result");
      await onSuccess(scan, photo.blob, savePhoto);
      if (token === sequence.current) setBusy("");
    } catch (e) {
      if (token === sequence.current) {
        setError(
          accepted.current
            ? "Analysis completed. Your result is held in this session; use its save retry rather than analyze again."
            : e instanceof Error
              ? e.message
              : "Network error. Your photo is still here. Please retry manually.",
        );
        setBusy("");
      }
    } finally {
      if (token === sequence.current) controller.current = null;
    }
  }
  return (
    <section className="stack" aria-labelledby="scan-heading">
      <div>
        <p className="eyebrow">A closer look, not a score</p>
        <h1 id="scan-heading">Your next step starts here</h1>
        <p className="muted">
          One frontal photo. Local photo checks first, personalized AI advice
          only with your permission.
        </p>
      </div>
      <div className="card stack">
        <h2>Set yourself up for a clear photo</h2>
        <p>
          One adult face, facing forward. Keep the camera level, your expression
          neutral and the light even. Avoid filters, sunglasses and anything
          covering your face.
        </p>
        <p className="muted">
          JPEG, PNG or WebP · up to 10 MiB · at least 256 × 256 pixels. Animated
          images use only the first decoded frame; all previews are static. No
          side-profile or medical measurements.
        </p>
      </div>
      {offline && (
        <p className="notice" role="status">
          You are offline. Saved results still work; new AI analysis needs an
          internet connection. First-time local face checks also need downloaded
          model assets.
        </p>
      )}
      {!photo && (
        <div
          className="card stack"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void choose(e.dataTransfer.files[0]);
          }}
        >
          <h2>Choose your photo</h2>
          <p className="muted">
            Drop a photo here, upload one, or use your device camera.
          </p>
          <div className="row">
            <button
              type="button"
              className="button"
              onClick={() => fileInput.current?.click()}
            >
              Upload photo
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => cameraInput.current?.click()}
            >
              Take photo
            </button>
          </div>
        </div>
      )}
      <input
        ref={fileInput}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          void choose(e.currentTarget.files?.[0]);
          e.currentTarget.value = "";
        }}
      />
      <input
        ref={cameraInput}
        hidden
        type="file"
        accept="image/*"
        capture="user"
        onChange={(e) => {
          void choose(e.currentTarget.files?.[0]);
          e.currentTarget.value = "";
        }}
      />
      {photo && (
        <div className="card stack">
          <h2 ref={statusHeading} tabIndex={-1}>
            {review
              ? "Review & give permission"
              : "Is this the photo you want?"}
          </h2>
          <div
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 430,
              aspectRatio: "4 / 5",
              background: "#171525",
              overflow: "hidden",
              borderRadius: 20,
              marginInline: "auto",
            }}
          >
            {/* The same metadata-stripped JPEG is previewed, measured and sent. */}
            <img
              src={photo.url}
              alt="Your prepared photo for review"
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
            {!review && (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: "12% 16%",
                  border: "2px dashed rgba(255,255,255,.65)",
                  borderRadius: "50%",
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
          <p className="muted">
            Static, metadata-stripped preview. The oval is a framing guide, not
            a detection result.
          </p>
          <div className="row">
            <button type="button" className="button secondary" onClick={reset}>
              Retake
            </button>
            {!review && (
              <button
                type="button"
                className="button"
                disabled={Boolean(phase)}
                onClick={() => void checkPhoto()}
              >
                {error ? "Retry face checks" : "Use this photo"}
              </button>
            )}
          </div>
          {review && checks && (
            <>
              <h3>Measured in this photo</h3>
              <dl className="stack">
                <div>
                  <dt>Face-outline height / width</dt>
                  <dd>{checks.metrics.outlineHeightToWidth.toFixed(2)}</dd>
                </div>
                <div>
                  <dt>Eye-center spacing / face width</dt>
                  <dd>{checks.metrics.eyeSpacingToWidth.toFixed(2)}</dd>
                </div>
                <div>
                  <dt>Photo tilt</dt>
                  <dd>{checks.metrics.rollDegrees.toFixed(1)}°</dd>
                </div>
              </dl>
              <p className="muted">
                Approximate image-space observations, not attractiveness ratings
                or clinical measurements. These checks do not verify blur, skin
                health, symmetry or head yaw/pitch.
              </p>
              {checks.warnings.length > 0 && (
                <div className="notice stack">
                  <h3>Photo-quality notes</h3>
                  <ul>
                    {checks.warnings.map((w) => (
                      <li key={w}>{warningLabels[w]}</li>
                    ))}
                  </ul>
                  <label>
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      disabled={Boolean(phase)}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                    />{" "}
                    I understand these capture limitations and want to continue.
                  </label>
                </div>
              )}
              <p>
                Your prepared photo, selected goals, routine preferences and
                these measurements will be sent to Google Gemini. UFace does not
                keep them on its server. Use a billing-enabled Gemini project
                for personal photos. Google may retain inputs and outputs for
                safety and legal purposes; unpaid services may use them for
                improvement and human review.{" "}
                <a href="/privacy">Privacy details</a>
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={adult}
                  disabled={Boolean(phase)}
                  onChange={(e) => setAdult(e.target.checked)}
                />{" "}
                I am 18 or older and this is my own photo
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={remote}
                  disabled={Boolean(phase)}
                  onChange={(e) => setRemote(e.target.checked)}
                />{" "}
                Send this photo and my answers to Google Gemini for analysis
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={savePhoto}
                  disabled={Boolean(phase)}
                  onChange={(e) => setSavePhoto(e.target.checked)}
                />{" "}
                Save this photo on this device for progress comparisons
              </label>
              <p className="muted">
                Results save on this browser when storage is available. Photo
                saving is optional and local only. Nothing is uploaded until you
                press Analyze.
              </p>
              <button
                className="button"
                type="button"
                disabled={
                  !adult ||
                  !remote ||
                  (checks.warnings.length > 0 && !acknowledged) ||
                  Boolean(phase) ||
                  offline ||
                  accepted.current
                }
                onClick={() => void submit()}
              >
                Analyze my photo
              </button>
            </>
          )}
        </div>
      )}
      {phase && (
        <p role="status" aria-live="polite" className="notice">
          {phase}…
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
