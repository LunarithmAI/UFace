"use client";
import { useState } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import type { Profile } from "../lib/contracts";
import { InstallInstructions } from "./pwa";
import { goalLabels } from "./onboarding";
export default function Settings({
  profile,
  onEdit,
  onClear,
}: {
  profile: Profile | null;
  onEdit: () => void;
  onClear: () => void;
}) {
  const [message, setMessage] = useState(""),
    [requesting, setRequesting] = useState(false);
  async function persist() {
    setRequesting(true);
    try {
      if (!navigator.storage?.persist) {
        setMessage(
          "This browser does not offer persistent-storage requests. Keep in mind that local data can still be cleared.",
        );
        return;
      }
      const granted = await navigator.storage.persist();
      setMessage(
        granted
          ? "Persistent storage was granted. You or your browser can still delete this data; this is not a backup."
          : "The browser did not grant persistent storage. Your saved data remains usable but may be evicted.",
      );
    } catch {
      setMessage(
        "The browser could not request persistent storage. Your existing data has not been changed.",
      );
    } finally {
      setRequesting(false);
    }
  }
  return (
    <div className="stack">
      <div>
        <p className="eyebrow">YOU’RE IN CONTROL</p>
        <h1>Settings & privacy.</h1>
      </div>
      <section className="card stack">
        <h2>Your profile</h2>
        {profile ? (
          <>
            <p>{profile.goals.map((g) => goalLabels[g]).join(" · ")}</p>
            <p className="muted">
              {profile.dailyMinutes} minutes daily · {profile.budget} budget ·{" "}
              {profile.experience}
            </p>
          </>
        ) : (
          <p className="muted">
            No profile yet. Complete the short introduction before a scan.
          </p>
        )}
        <button className="button secondary" onClick={onEdit}>
          {profile ? "Edit profile" : "Get started"}
        </button>
        <p className="muted">
          Changes apply to new scans. Existing results keep the preferences you
          used at the time.
        </p>
      </section>
      <section className="card stack">
        <ShieldCheck size={28} />
        <h2>Saved here. Not in an account.</h2>
        <p>
          Your profile, results, and checklist stay in this browser. Photos are
          stored only when you opt in per scan. Anyone using this browser
          profile may be able to access them.
        </p>
        <p className="muted">
          Clearing browser data, private browsing, storage limits, or changing
          devices may remove access. Persistent storage may reduce automatic
          eviction; it does not create a backup or prevent deletion.
        </p>
        <button
          className="button secondary"
          disabled={requesting}
          onClick={persist}
        >
          {requesting ? "Asking browser…" : "Request persistent storage"}
        </button>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        <a href="/privacy">Read the privacy notice</a>
      </section>
      <section className="card">
        <h2>Keep UFace close</h2>
        <InstallInstructions />
      </section>
      <section className="card stack">
        <h2>Start fresh</h2>
        <p className="muted">
          Delete your profile, scans, saved photos, and checklist from this
          browser. This does not erase any provider retention from past
          consented analyses. Public offline app assets remain.
        </p>
        <button className="button secondary" onClick={onClear}>
          <Trash2 size={18} /> Delete all my data
        </button>
      </section>
    </div>
  );
}
