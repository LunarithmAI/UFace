"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, Trash2 } from "lucide-react";
import type { Scan } from "../lib/contracts";
import { goalLabels } from "./onboarding";
import styles from "./app.module.css";
export function Photo({
  blob,
  alt = "Your saved scan photo",
}: {
  blob?: Blob;
  alt?: string;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url ? (
    <img className={styles.photo} src={url} alt={alt} />
  ) : (
    <div className={styles.noPhoto}>Photo not saved</div>
  );
}
export function Metrics({ scan }: { scan: Scan }) {
  return (
    <div className={styles.metrics}>
      <div>
        <strong>{scan.metrics.outlineHeightToWidth.toFixed(2)}</strong>
        <span>Face-outline height / width</span>
      </div>
      <div>
        <strong>{scan.metrics.eyeSpacingToWidth.toFixed(2)}</strong>
        <span>Eye-center spacing / face width</span>
      </div>
      <div>
        <strong>{scan.metrics.rollDegrees.toFixed(1)}°</strong>
        <span>Photo tilt</span>
      </div>
    </div>
  );
}
export default function Results({
  scan,
  photo,
  navigate,
  onDelete,
}: {
  scan: Scan;
  photo?: Blob;
  navigate: (view: string, id?: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="stack">
      <div className="row">
        <div>
          <p className="eyebrow">YOUR PERSONAL STUDY</p>
          <h1>A fresh perspective.</h1>
          <p className="muted">{new Date(scan.createdAt).toLocaleString()}</p>
        </div>
        <button className="button secondary" onClick={() => onDelete(scan.id)}>
          <Trash2 size={16} /> Delete scan
        </button>
      </div>
      <div className={styles.resultHero}>
        <Photo blob={photo} />
        <div className="card stack">
          <p className="eyebrow">AI SUMMARY · NOT A RATING</p>
          <h2>Build on what’s yours.</h2>
          <p>{scan.advice.summary}</p>
          <button className="button" onClick={() => navigate("plan", scan.id)}>
            View my plan <ArrowUpRight size={18} />
          </button>
          <button className="button secondary" onClick={() => navigate("scan")}>
            New scan
          </button>
        </div>
      </div>
      <section className="card">
        <h2>Measured in this photo</h2>
        <Metrics scan={scan} />
        <p className="muted">
          Deterministic image-space proportions from local landmarks. These are
          not clinical measurements or ideal ratios. Pose, lighting, camera
          distance, and the visible face outline affect them.
        </p>
        {scan.warnings.length > 0 && (
          <p className="notice">
            Capture notes:{" "}
            {scan.warnings.map((w) => w.replaceAll("-", " ")).join(" · ")}
          </p>
        )}
      </section>
      <section className="stack">
        <div>
          <p className="eyebrow">PERSONALIZED, NOT PRESCRIPTIVE</p>
          <h2>AI suggestions</h2>
        </div>
        <div className={styles.twoColumns}>
          {scan.advice.observations.map((o, i) => (
            <article className="card" key={i}>
              <p className="eyebrow">{goalLabels[o.category]}</p>
              <h3>{o.observation}</h3>
              <p className="muted">{o.suggestion}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>A note on perspective</h2>
        <ul>
          {scan.advice.limitations.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        <p className="muted">
          AI suggestions can be mistaken and are not medical advice. Model:{" "}
          {scan.model}.
        </p>
      </section>
    </div>
  );
}
