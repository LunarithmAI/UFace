"use client";

import { useEffect, useRef, useState } from "react";

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
type NavigatorStandalone = Navigator & { standalone?: boolean };

export function InstallInstructions() {
  const [platform, setPlatform] = useState<"ios" | "other" | "installed">(
    "other",
  );
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as NavigatorStandalone).standalone;
    setPlatform(
      standalone
        ? "installed"
        : /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
          ? "ios"
          : "other",
    );
  }, []);
  return (
    <p className="muted">
      {platform === "installed"
        ? "UFace is open as an installed app."
        : platform === "ios"
          ? "To install: open UFace in Safari, tap Share, then Add to Home Screen."
          : "To install: use your browser’s Install app or Add to Home Screen menu, if available. Installation requires HTTPS (or localhost)."}{" "}
      Saved results and routines work offline after the public app shell is
      downloaded. New AI analysis needs internet.
    </p>
  );
}

export default function PWA({
  activeAnalysis = false,
}: {
  activeAnalysis?: boolean;
}) {
  const [online, setOnline] = useState(true);
  const [offlineReady, setOfflineReady] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(activeAnalysis);
  const updateApproved = useRef(false);
  const pendingReload = useRef(false);
  const didReload = useRef(false);
  active.current = activeAnalysis;

  useEffect(() => {
    if (!activeAnalysis && pendingReload.current && !didReload.current) {
      didReload.current = true;
      window.location.reload();
    }
  }, [activeAnalysis]);

  useEffect(() => {
    let disposed = false;
    let registration: ServiceWorkerRegistration | null = null;
    let installingWorker: ServiceWorker | null = null;
    let channel: MessageChannel | null = null;
    let statusTimeout: number | undefined;
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as NavigatorStandalone).standalone;
    const connectivity = () => setOnline(navigator.onLine);
    connectivity();
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    const offerInstall = (event: Event) => {
      event.preventDefault();
      if (!isStandalone) setInstallPrompt(event as InstallEvent);
    };
    const installed = () => {
      setInstallPrompt(null);
      setInstalling(false);
    };
    window.addEventListener("beforeinstallprompt", offerInstall);
    window.addEventListener("appinstalled", installed);

    const checkReady = () => {
      channel?.port1.close();
      window.clearTimeout(statusTimeout);
      const controller = navigator.serviceWorker?.controller;
      if (!controller) {
        setOfflineReady(false);
        return;
      }
      channel = new MessageChannel();
      const current = channel;
      current.port1.onmessage = (event) => {
        if (!disposed) setOfflineReady(event.data?.ready === true);
        current.port1.close();
        window.clearTimeout(statusTimeout);
      };
      controller.postMessage({ type: "UFACE_OFFLINE_STATUS" }, [current.port2]);
      statusTimeout = window.setTimeout(() => {
        current.port1.close();
        if (!disposed) setOfflineReady(false);
      }, 5000);
    };
    const controllerChanged = () => {
      checkReady();
      if (!updateApproved.current) return;
      if (active.current) {
        pendingReload.current = true;
        return;
      }
      if (!didReload.current) {
        didReload.current = true;
        window.location.reload();
      }
    };
    const stateChanged = () => {
      if (
        installingWorker?.state === "installed" &&
        registration?.waiting &&
        navigator.serviceWorker.controller
      )
        setWaiting(registration.waiting);
    };
    const updateFound = () => {
      installingWorker?.removeEventListener("statechange", stateChanged);
      installingWorker = registration?.installing ?? null;
      installingWorker?.addEventListener("statechange", stateChanged);
    };
    const register = async () => {
      if (
        process.env.NODE_ENV !== "production" ||
        !("serviceWorker" in navigator) ||
        !window.isSecureContext
      )
        return;
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        controllerChanged,
      );
      try {
        const next = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (disposed) return;
        registration = next;
        next.addEventListener("updatefound", updateFound);
        updateFound();
        if (next.waiting && navigator.serviceWorker.controller)
          setWaiting(next.waiting);
        checkReady();
      } catch {
        if (!disposed)
          setError(
            "Offline setup could not finish. Reopen UFace online to try again; your local history is unchanged.",
          );
      }
    };
    const loaded = () => {
      void register();
    };
    if (document.readyState === "complete") loaded();
    else window.addEventListener("load", loaded, { once: true });
    return () => {
      disposed = true;
      window.removeEventListener("online", connectivity);
      window.removeEventListener("offline", connectivity);
      window.removeEventListener("beforeinstallprompt", offerInstall);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("load", loaded);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        controllerChanged,
      );
      registration?.removeEventListener("updatefound", updateFound);
      installingWorker?.removeEventListener("statechange", stateChanged);
      channel?.port1.close();
      window.clearTimeout(statusTimeout);
    };
  }, []);

  async function install() {
    if (!installPrompt || installing) return;
    const prompt = installPrompt;
    setInstalling(true);
    setError("");
    try {
      await prompt.prompt();
      await prompt.userChoice;
      setInstallPrompt(null);
    } catch {
      setInstallPrompt(null);
      setError(
        "The browser could not open installation. Use its install menu instead.",
      );
    } finally {
      setInstalling(false);
    }
  }

  function update() {
    if (active.current || !waiting || updating) return;
    updateApproved.current = true;
    setUpdating(true);
    waiting.postMessage({ type: "UFACE_SKIP_WAITING" });
  }

  return (
    <section
      aria-label="App availability"
      className="stack"
      style={{ gap: "0.65rem" }}
    >
      {!online && (
        <p className="notice" role="status">
          You’re offline. Saved results and routines are available on this
          device. New AI analysis needs internet.
        </p>
      )}
      {offlineReady && (
        <small className="muted" role="status">
          Available offline · saved results & routines
        </small>
      )}
      {waiting && (
        <div className="notice row">
          <span>
            {activeAnalysis
              ? "Update available. Finish or cancel your analysis before updating."
              : "Update available. Updating reloads UFace; finish any unsaved changes first."}
          </span>
          <button
            className="button secondary"
            type="button"
            disabled={activeAnalysis || updating}
            onClick={update}
          >
            {updating ? "Updating…" : "Update now"}
          </button>
        </div>
      )}
      {installPrompt && (
        <button
          type="button"
          className="button secondary"
          onClick={() => void install()}
          disabled={installing}
        >
          {installing ? "Opening install…" : "Install UFace"}
        </button>
      )}
      {error && (
        <p className="error" role="status">
          {error}
        </p>
      )}
    </section>
  );
}
