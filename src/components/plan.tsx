"use client";
import type { Scan } from "../lib/contracts";
import {
  completionBucket,
  completionKey,
  type Completion,
} from "../lib/storage";
import { goalLabels } from "./onboarding";
import styles from "./app.module.css";
export default function Plan({
  scan,
  completions,
  onToggle,
  navigate,
  now,
}: {
  scan: Scan;
  completions: Set<string>;
  onToggle: (item: Completion, checked: boolean) => void;
  navigate: (view: string, id?: string) => void;
  now: Date;
}) {
  const items = scan.advice.routine.map((action, actionIndex) => ({
    action,
    item: {
      scanId: scan.id,
      actionIndex,
      bucket: completionBucket(action.frequency, now),
    },
  }));
  const done = items.filter(({ item }) =>
    completions.has(completionKey(item)),
  ).length;
  return (
    <div className="stack">
      <div>
        <p className="eyebrow">SMALL STEPS, REPEATED</p>
        <h1>Your everyday plan.</h1>
        <p className="muted">
          From your {new Date(scan.createdAt).toLocaleDateString()} scan ·{" "}
          {scan.profile.goals.map((g) => goalLabels[g]).join(" · ")}
        </p>
      </div>
      <section className="card">
        <div className="row">
          <h2>
            {done} / {items.length} complete
          </h2>
          <span className="muted">Routine adherence, not appearance</span>
        </div>
        <progress
          className={styles.progressBar}
          value={done}
          max={items.length}
          aria-label="Routine actions complete"
        />
        <p className="muted">
          Daily items reset each local day; weekly items reset Monday. One-time
          actions stay checked. Your latest scan starts a new plan.
        </p>
      </section>
      <div className="stack">
        {items.map(({ action, item }) => (
          <article className={`card ${styles.action}`} key={item.actionIndex}>
            <input
              id={`action-${item.actionIndex}`}
              type="checkbox"
              checked={completions.has(completionKey(item))}
              onChange={(e) => onToggle(item, e.target.checked)}
            />
            <div>
              <label htmlFor={`action-${item.actionIndex}`}>
                <h2>{action.title}</h2>
              </label>
              <p className="eyebrow">
                {action.frequency} · {action.minutes} min ·{" "}
                {goalLabels[action.category]}
              </p>
              <p className="muted">{action.instruction}</p>
            </div>
          </article>
        ))}
      </div>
      <button
        className="button secondary"
        onClick={() => navigate("results", scan.id)}
      >
        View this scan’s results
      </button>
    </div>
  );
}
