"use client";
import { useState } from "react";
import { Trash2, ArrowUpRight } from "lucide-react";
import type { Scan } from "../lib/contracts";
import { Photo, Metrics } from "./results";
import styles from "./app.module.css";
export default function Progress({
  scans,
  photos,
  navigate,
  onDelete,
}: {
  scans: Scan[];
  photos: Map<string, Blob>;
  navigate: (view: string, id?: string) => void;
  onDelete: (id: string) => void;
}) {
  const [first, setFirst] = useState(scans.at(-1)?.id ?? ""),
    [second, setSecond] = useState(scans[0]?.id ?? "");
  const a = scans.find((s) => s.id === first) ?? scans.at(-1),
    b = scans.find((s) => s.id === second) ?? scans[0];
  return (
    <div className="stack">
      <div>
        <p className="eyebrow">YOUR DEVICE-LOCAL JOURNAL</p>
        <h1>Notice the routine.</h1>
        <p className="muted">
          A record of your scans—not a ranking of your face.
        </p>
      </div>
      {scans.length > 1 ? (
        <section className="card stack">
          <h2>Compare two moments</h2>
          <p className="muted">
            Use similar pose, lighting, and camera distance. Numerical
            differences may be capture variation, not physical change.
          </p>
          <div className={styles.twoColumns}>
            {[
              {
                scan: a,
                value: a?.id,
                set: setFirst,
                label: "Earlier or first scan",
              },
              {
                scan: b,
                value: b?.id,
                set: setSecond,
                label: "Later or second scan",
              },
            ].map(({ scan, value, set, label }) => (
              <div className="stack" key={label}>
                <label>
                  {label}
                  <select value={value} onChange={(e) => set(e.target.value)}>
                    {[...scans].reverse().map((s) => (
                      <option key={s.id} value={s.id}>
                        {new Date(s.createdAt).toLocaleString()} ·{" "}
                        {s.id.slice(0, 6)}
                      </option>
                    ))}
                  </select>
                </label>
                {scan && (
                  <>
                    <Photo blob={photos.get(scan.id)} />
                    <p>{new Date(scan.createdAt).toLocaleString()}</p>
                    <Metrics scan={scan} />
                    <p className="muted">
                      Capture notes:{" "}
                      {scan.warnings.length
                        ? scan.warnings
                            .map((w) => w.replaceAll("-", " "))
                            .join(", ")
                        : "None flagged by local checks"}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
          {a?.id === b?.id && (
            <p className="notice">
              Choose two different records for a comparison.
            </p>
          )}
        </section>
      ) : (
        <section className="card">
          <h2>A starting point, saved.</h2>
          <p className="muted">
            A second scan will unlock side-by-side comparison. Photos only
            appear if you opted to save them.
          </p>
          <button className="button secondary" onClick={() => navigate("scan")}>
            Take another scan
          </button>
        </section>
      )}
      <section className="stack">
        <h2>Scan history</h2>
        {[...scans].reverse().map((s) => (
          <article className={`card ${styles.history}`} key={s.id}>
            <div>
              <p className="eyebrow">
                {new Date(s.createdAt).toLocaleString()}
              </p>
              <h3>{s.profile.goals.join(" · ")}</h3>
              <p className="muted">
                {photos.has(s.id)
                  ? "Photo available on this device"
                  : "Photo not saved"}
              </p>
            </div>
            <div className="row">
              <button
                className="button secondary"
                onClick={() => navigate("results", s.id)}
              >
                Open <ArrowUpRight size={16} />
              </button>
              <button
                className="button secondary"
                aria-label={`Delete scan from ${new Date(s.createdAt).toLocaleString()}`}
                onClick={() => onDelete(s.id)}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
