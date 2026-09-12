"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Camera,
  CheckCheck,
  House,
  Layers3,
  Settings as SettingsIcon,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { Profile, Scan as ScanRecord } from "../lib/contracts";
import * as storage from "../lib/storage";
import Onboarding from "./onboarding";
import Scan from "./scan";
import Results, { Photo } from "./results";
import Plan from "./plan";
import Progress from "./progress";
import Settings from "./settings";
import PWA from "./pwa";
import styles from "./app.module.css";
type LocationState = { view: string; id?: string };
const views = ["dashboard", "scan", "results", "plan", "progress", "settings"];
type PendingScan = { scan: ScanRecord; photo?: Blob };
export default function UFaceApp() {
  const [ready, setReady] = useState(false),
    [location, setLocation] = useState<LocationState>({ view: "dashboard" }),
    [profile, setProfile] = useState<Profile | null>(null),
    [scans, setScans] = useState<ScanRecord[]>([]),
    [photos, setPhotos] = useState<Map<string, Blob>>(new Map()),
    [completions, setCompletions] = useState<Set<string>>(new Set()),
    [recovery, setRecovery] = useState<storage.Recovery[]>([]),
    [storageError, setStorageError] = useState(""),
    [busy, setBusy] = useState(false),
    [generation, setGeneration] = useState(0),
    [revision, setRevision] = useState(0),
    [retrying, setRetrying] = useState(false),
    [now, setNow] = useState(() => new Date());
  const [livePhoto, setLivePhoto] = useState<{ id: string; blob: Blob } | null>(
    null,
  );
  const epoch = useRef(0),
    deleted = useRef(new Set<string>()),
    pendingProfile = useRef<Profile | null>(null),
    pendingScans = useRef(new Map<string, PendingScan>()),
    pendingCompletions = useRef(
      new Map<string, { item: storage.Completion; checked: boolean }>(),
    ),
    pendingDeletes = useRef(new Set<string>()),
    pendingClear = useRef(false),
    heading = useRef<HTMLElement>(null);
  const dirty =
    !!pendingProfile.current ||
    pendingScans.current.size > 0 ||
    pendingCompletions.current.size > 0 ||
    pendingDeletes.current.size > 0 ||
    pendingClear.current;
  const navigate = useCallback((view: string, id?: string) => {
    const next =
      view === "quiz"
        ? "/quiz"
        : `/app?view=${views.includes(view) ? view : "dashboard"}${id ? `&id=${encodeURIComponent(id)}` : ""}`;
    history.pushState(null, "", next);
    setLocation({
      view:
        view === "quiz" ? "quiz" : views.includes(view) ? view : "dashboard",
      id,
    });
  }, []);
  useEffect(() => {
    let live = true;
    const readLocation = () => {
      const u = new URL(window.location.href);
      const view =
        u.pathname === "/quiz"
          ? "quiz"
          : (u.searchParams.get("view") ?? "dashboard");
      setLocation({
        view: view === "quiz" || views.includes(view) ? view : "dashboard",
        id: u.searchParams.get("id") ?? undefined,
      });
    };
    readLocation();
    window.addEventListener("popstate", readLocation);
    const token = epoch.current;
    storage
      .loadData()
      .then((data) => {
        if (!live || token !== epoch.current) return;
        setProfile(data.profile);
        setScans(data.scans);
        setPhotos(data.photos);
        setCompletions(new Set(data.completions.map(storage.completionKey)));
        setRecovery(data.recovery);
      })
      .catch(() => {
        if (live)
          setStorageError(
            "Device storage could not be opened. You can still use UFace; new data stays in memory until saving works and will disappear on reload.",
          );
      })
      .finally(() => {
        if (live) setReady(true);
      });
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => {
      live = false;
      window.removeEventListener("popstate", readLocation);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (ready) heading.current?.focus();
  }, [location, ready]);
  function changed() {
    setRevision((n) => n + 1);
  }
  async function persistProfile(p: Profile) {
    const token = epoch.current;
    pendingProfile.current = p;
    changed();
    try {
      await storage.saveProfile(p, () => token === epoch.current);
      if (token === epoch.current && pendingProfile.current === p)
        pendingProfile.current = null;
    } catch {
      if (token === epoch.current)
        setStorageError(
          "Not saved on this device. Your profile is available in this session; retry saving before closing.",
        );
    }
    if (token === epoch.current) changed();
  }
  async function acceptResult(
    scan: ScanRecord,
    blob: Blob,
    savePhoto: boolean,
  ) {
    const token = generation;
    if (token !== epoch.current || deleted.current.has(scan.id)) return;
    setScans((prev) =>
      [scan, ...prev.filter((s) => s.id !== scan.id)].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    );
    setLivePhoto({ id: scan.id, blob });
    if (savePhoto) setPhotos((prev) => new Map(prev).set(scan.id, blob));
    const item = { scan, photo: savePhoto ? blob : undefined };
    pendingScans.current.set(scan.id, item);
    changed();
    try {
      await storage.saveScan(
        scan,
        item.photo,
        () => token === epoch.current && !deleted.current.has(scan.id),
      );
      if (token === epoch.current) pendingScans.current.delete(scan.id);
    } catch {
      if (token === epoch.current)
        setStorageError(
          "Not saved on this device. Your result remains here for this session. Retry saving without another AI request.",
        );
    }
    if (token === epoch.current && !deleted.current.has(scan.id)) {
      changed();
      navigate("results", scan.id);
    }
  }
  async function toggle(item: storage.Completion, checked: boolean) {
    const token = epoch.current,
      key = storage.completionKey(item),
      operation = { item, checked };
    setCompletions((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
    pendingCompletions.current.set(key, operation);
    changed();
    try {
      await storage.saveCompletion(
        item,
        checked,
        () => token === epoch.current && !deleted.current.has(item.scanId),
      );
      if (
        token === epoch.current &&
        pendingCompletions.current.get(key) === operation
      )
        pendingCompletions.current.delete(key);
    } catch {
      if (token === epoch.current)
        setStorageError(
          "Checklist changes are not saved on this device. They remain checked in this session; retry saving.",
        );
    }
    if (token === epoch.current) changed();
  }
  async function removeScan(id: string) {
    if (
      !window.confirm(
        "Delete this scan, its saved photo, and all of its checklist history from this browser? This cannot be undone.",
      )
    )
      return;
    const token = epoch.current;
    deleted.current.add(id);
    setLivePhoto((prev) => (prev?.id === id ? null : prev));
    pendingScans.current.delete(id);
    for (const [key, op] of pendingCompletions.current)
      if (op.item.scanId === id) pendingCompletions.current.delete(key);
    setScans((prev) => prev.filter((s) => s.id !== id));
    setPhotos((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setCompletions(
      (prev) =>
        new Set([...prev].filter((k) => (JSON.parse(k) as [string])[0] !== id)),
    );
    pendingDeletes.current.add(id);
    if (location.id === id) navigate("progress");
    changed();
    try {
      await storage.deleteScan(id);
      if (token === epoch.current) pendingDeletes.current.delete(id);
    } catch {
      if (token === epoch.current)
        setStorageError(
          "Deletion could not be saved to device storage. Retry deletion before closing; the stored record may otherwise return on reload.",
        );
    }
    changed();
  }
  async function clearAll() {
    if (
      !window.confirm(
        "Permanently delete all UFace profile, results, photos, and checklist data from this browser?",
      )
    )
      return;
    const token = ++epoch.current;
    setGeneration(token);
    setBusy(false);
    setLivePhoto(null);
    pendingProfile.current = null;
    pendingScans.current.clear();
    pendingCompletions.current.clear();
    pendingDeletes.current.clear();
    pendingClear.current = true;
    setProfile(null);
    setScans([]);
    setPhotos(new Map());
    setCompletions(new Set());
    setRecovery([]);
    setStorageError("");
    navigate("dashboard");
    changed();
    try {
      await storage.clearData();
      if (token === epoch.current) pendingClear.current = false;
    } catch {
      if (token === epoch.current)
        setStorageError(
          "Device storage could not be cleared. Session data has been removed, but saved data may return on reload. Retry deletion or clear UFace site data in browser settings.",
        );
    }
    changed();
  }
  async function retry() {
    setRetrying(true);
    const token = epoch.current;
    try {
      if (pendingClear.current) {
        await storage.clearData();
        if (token !== epoch.current) return;
        pendingClear.current = false;
      }
      for (const id of [...pendingDeletes.current]) {
        await storage.deleteScan(id);
        if (token !== epoch.current) return;
        pendingDeletes.current.delete(id);
      }
      const p = pendingProfile.current;
      if (p) {
        await storage.saveProfile(p, () => token === epoch.current);
        if (token !== epoch.current) return;
        if (pendingProfile.current === p) pendingProfile.current = null;
      }
      for (const [id, op] of [...pendingScans.current]) {
        await storage.saveScan(
          op.scan,
          op.photo,
          () => token === epoch.current && !deleted.current.has(id),
        );
        if (token !== epoch.current) return;
        if (pendingScans.current.get(id) === op)
          pendingScans.current.delete(id);
      }
      for (const [key, op] of [...pendingCompletions.current]) {
        await storage.saveCompletion(
          op.item,
          op.checked,
          () => token === epoch.current && !deleted.current.has(op.item.scanId),
        );
        if (token !== epoch.current) return;
        if (pendingCompletions.current.get(key) === op)
          pendingCompletions.current.delete(key);
      }
      const data = await storage.loadData();
      if (token !== epoch.current) return;
      setRecovery(data.recovery);
      setStorageError("");
    } catch {
      if (token === epoch.current)
        setStorageError(
          "Device storage is still unavailable. Unsaved changes remain in this session. Retry or check your browser’s site-storage settings.",
        );
    } finally {
      setRetrying(false);
      changed();
    }
  }
  async function removeCorrupt(entry: storage.Recovery) {
    if (
      !window.confirm(
        "Delete this unreadable saved entry? This cannot be undone.",
      )
    )
      return;
    try {
      await storage.deleteRecovery(entry);
      setRecovery((prev) => prev.filter((e) => e !== entry));
    } catch {
      setStorageError(
        "The unreadable entry could not be deleted. Check browser storage permissions and try again.",
      );
    }
  }
  if (!ready)
    return (
      <main className={styles.loading} aria-busy="true">
        <Sparkles size={32} />
        <p>Opening your space…</p>
      </main>
    );
  const latest = scans[0],
    selected = location.id ? scans.find((s) => s.id === location.id) : latest;
  const nav = [
    { view: "dashboard", label: "Overview", icon: House },
    { view: "scan", label: "Scan", icon: Camera },
    { view: "plan", label: "Plan", icon: CheckCheck },
    { view: "progress", label: "Progress", icon: TrendingUp },
  ];
  const completed = latest
    ? latest.advice.routine.filter((a, i) =>
        completions.has(
          storage.completionKey({
            scanId: latest.id,
            actionIndex: i,
            bucket: storage.completionBucket(a.frequency, now),
          }),
        ),
      ).length
    : 0;
  let content;
  if (location.view === "quiz")
    content = (
      <Onboarding
        initial={profile}
        onCancel={() => navigate(profile ? "settings" : "dashboard")}
        onComplete={(p) => {
          setProfile(p);
          void persistProfile(p);
          navigate("scan");
        }}
      />
    );
  else if (location.view === "settings")
    content = (
      <Settings
        profile={profile}
        onEdit={() => navigate("quiz")}
        onClear={() => void clearAll()}
      />
    );
  else if (location.view === "scan")
    content = profile ? (
      <Scan
        key={generation}
        profile={profile}
        onSuccess={acceptResult}
        onBusyChange={setBusy}
        generation={generation}
      />
    ) : (
      <section className="card stack">
        <p className="eyebrow">LET’S GET TO KNOW YOUR ROUTINE</p>
        <h1>Your first step starts here.</h1>
        <p>
          Choose your goals and confirm you’re 18 or older before adding your
          own photo.
        </p>
        <button className="button" onClick={() => navigate("quiz")}>
          Start my profile <ArrowUpRight size={18} />
        </button>
      </section>
    );
  else if (
    (location.view === "results" || location.view === "plan") &&
    (!selected || (location.view === "results" && !location.id))
  )
    content = (
      <section className="card stack">
        <h1>
          {location.id || location.view === "results"
            ? "This result isn’t here."
            : "Your plan starts with a scan."}
        </h1>
        <p className="muted">
          {location.id
            ? "It may have been deleted or saved in a different browser."
            : "An actual photo analysis creates your personalized routine. No sample results here."}
        </p>
        <button className="button" onClick={() => navigate("scan")}>
          New scan
        </button>
        <button
          className="button secondary"
          onClick={() => navigate("progress")}
        >
          View history
        </button>
      </section>
    );
  else if (location.view === "results" && selected)
    content = (
      <Results
        scan={selected}
        photo={
          photos.get(selected.id) ??
          (livePhoto?.id === selected.id ? livePhoto.blob : undefined)
        }
        navigate={navigate}
        onDelete={(id) => void removeScan(id)}
      />
    );
  else if (location.view === "plan" && selected)
    content = (
      <Plan
        scan={selected}
        completions={completions}
        onToggle={(item, checked) => void toggle(item, checked)}
        navigate={navigate}
        now={now}
      />
    );
  else if (location.view === "progress")
    content = scans.length ? (
      <Progress
        scans={scans}
        photos={photos}
        navigate={navigate}
        onDelete={(id) => void removeScan(id)}
      />
    ) : (
      <section className="card stack">
        <TrendingUp size={32} />
        <p className="eyebrow">A JOURNAL, NOT A SCOREBOARD</p>
        <h1>Make room for progress.</h1>
        <p className="muted">
          Your saved scans and optional photos will appear here. Start with one
          honest snapshot.
        </p>
        <button className="button" onClick={() => navigate("scan")}>
          Take my first scan
        </button>
      </section>
    );
  else
    content = (
      <div className="stack">
        <div className={styles.dashboardHeading}>
          <div>
            <p className="eyebrow">A LITTLE MORE YOU, EVERY DAY</p>
            <h1>Your space to grow.</h1>
            <p className="muted">
              Thoughtful guidance. Small habits. Your own pace.
            </p>
          </div>
          <button className="button" onClick={() => navigate("scan")}>
            <Camera size={18} /> New scan
          </button>
        </div>
        <div className={styles.dashboardGrid}>
          <section className={`card ${styles.featureCard}`}>
            <div>
              <p className="eyebrow">
                {latest ? "YOUR LATEST PERSPECTIVE" : "MEET YOUR NEXT CHAPTER"}
              </p>
              <h2>
                {latest
                  ? "A plan that starts with you."
                  : "See yourself with fresh eyes."}
              </h2>
              <p className="muted">
                {latest
                  ? latest.advice.summary
                  : "One frontal photo. Local face measurements. Personalized AI grooming advice, only with your permission."}
              </p>
              <button
                className="button"
                onClick={() =>
                  navigate(latest ? "results" : "scan", latest?.id)
                }
              >
                {latest ? "Explore your results" : "Begin your first scan"}{" "}
                <ArrowUpRight size={18} />
              </button>
            </div>
            {latest ? (
              <Photo blob={photos.get(latest.id)} />
            ) : (
              <img
                className={styles.art}
                src="/face-study.svg"
                alt="Original line study of a face"
              />
            )}
          </section>
          <section className="card stack">
            <CheckCheck className={styles.blue} size={30} />
            <p className="eyebrow">YOUR DAILY PRACTICE</p>
            <h2>
              {latest
                ? `${completed} of ${latest.advice.routine.length}`
                : "Small steps. Real intention."}
            </h2>
            <p className="muted">
              {latest
                ? "Actions complete in your current routine. Consistency, not perfection."
                : "Your first analysis will turn your chosen goals into a manageable routine."}
            </p>
            <button
              className="button secondary"
              onClick={() => navigate(latest ? "plan" : "scan")}
            >
              {latest ? "Open my routine" : "Build my routine"}
            </button>
          </section>
          <section className="card stack">
            <Layers3 className={styles.blue} size={28} />
            <h2>A record that’s yours.</h2>
            <p className="muted">
              {scans.length
                ? `${scans.length} ${scans.length === 1 ? "scan" : "scans"} in this session and device history.`
                : "No saved scans yet."}{" "}
              Compare captures without beauty rankings or promised changes.
            </p>
            <button
              className="button secondary"
              onClick={() => navigate("progress")}
            >
              View progress <ArrowUpRight size={16} />
            </button>
          </section>
          <section className="card stack">
            <p className="eyebrow">LESS JUDGMENT. MORE CLARITY.</p>
            <h2>You’re more than a measurement.</h2>
            <p className="muted">
              Face proportions depend on the photo. AI advice is subjective,
              never a diagnosis or an objective measure of attractiveness.
            </p>
            <a href="/privacy">Your privacy, explained</a>
          </section>
        </div>
      </div>
    );
  return (
    <div className={styles.shell} data-revision={revision}>
      <aside className={styles.sidebar}>
        <a className={styles.brand} href="/">
          U<span>Face</span>
          <span className={styles.brandDot} />
        </a>
        <p className="eyebrow">MAKE IT YOURS</p>
        <nav aria-label="Main navigation">
          {nav.map(({ view, label, icon: Icon }) => (
            <button
              key={view}
              className={styles.navLink}
              aria-current={location.view === view ? "page" : undefined}
              onClick={() => navigate(view)}
            >
              <Icon size={20} />
              {label}
            </button>
          ))}
          <button
            className={styles.navLink}
            aria-current={location.view === "settings" ? "page" : undefined}
            onClick={() => navigate("settings")}
          >
            <SettingsIcon size={20} />
            Settings
          </button>
        </nav>
        <div className={styles.sidebarNote}>
          <ShieldNote />
        </div>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.header}>
          <span className={styles.headerBrand}>
            UFace <span className="muted">/ Your personal space</span>
          </span>
          <button
            className="button secondary"
            aria-label="Open settings"
            onClick={() => navigate("settings")}
          >
            <SettingsIcon size={19} />
          </button>
        </header>
        <main className={styles.main} tabIndex={-1} ref={heading}>
          <PWA activeAnalysis={busy} />
          {(storageError || dirty) && (
            <div className="notice" role="status">
              <strong>
                {pendingClear.current || pendingDeletes.current.size
                  ? "Deletion pending on this device"
                  : "Not saved on this device"}
              </strong>
              <p>{storageError || "Saving your changes…"}</p>
              <button
                className="button secondary"
                disabled={retrying}
                onClick={() => void retry()}
              >
                {retrying ? "Retrying…" : "Retry device storage"}
              </button>
            </div>
          )}
          {recovery.map((entry, i) => (
            <div className="notice" key={i} role="alert">
              <p>{entry.message} Other valid records remain available.</p>
              <button
                className="button secondary"
                onClick={() => void removeCorrupt(entry)}
              >
                Delete unreadable entry
              </button>
            </div>
          ))}
          {content}
        </main>
      </div>
      <nav className={styles.mobileNav} aria-label="Mobile navigation">
        {nav.map(({ view, label, icon: Icon }) => (
          <button
            key={view}
            aria-current={location.view === view ? "page" : undefined}
            onClick={() => navigate(view)}
          >
            <Icon size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
function ShieldNote() {
  return (
    <>
      <Sparkles size={22} />
      <p>Made for your pace.</p>
      <small>
        Private device-local history.
        <br />
        No ratings. No accounts.
      </small>
    </>
  );
}
