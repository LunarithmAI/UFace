/* Generated with an explicit build-specific public asset allowlist. */
const CACHE_NAME = __UFACE_CACHE_NAME__;
const PRECACHE = __UFACE_PRECACHE__;
const DOCUMENTS = new Set(["/", "/quiz", "/app", "/privacy", "/terms"]);
const ASSETS = new Set(PRECACHE.filter((path) => !DOCUMENTS.has(path)));

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(
          PRECACHE.map((path) => new Request(path, { cache: "reload" })),
        );
      } catch (error) {
        await caches.delete(CACHE_NAME);
        throw error;
      }
      // Updates remain waiting until the user explicitly accepts them.
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys())
          .filter((name) => name.startsWith("uface-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "UFACE_SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  } else if (event.data?.type === "UFACE_OFFLINE_STATUS") {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const keys = new Set(
          (await cache.keys()).map((request) => new URL(request.url).pathname),
        );
        event.ports[0]?.postMessage({
          ready: PRECACHE.every((path) => keys.has(path)),
        });
      })(),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    request.headers.has("RSC") ||
    request.headers.has("Next-Router-State-Tree") ||
    url.searchParams.has("_rsc")
  )
    return;
  if (request.mode === "navigate" && DOCUMENTS.has(url.pathname)) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) return response;
          const cached = await (
            await caches.open(CACHE_NAME)
          ).match(url.pathname);
          return cached || response;
        } catch {
          const cached = await (
            await caches.open(CACHE_NAME)
          ).match(url.pathname);
          return (
            cached ||
            new Response(
              "UFace is unavailable offline. Open it online once to prepare the app.",
              {
                status: 503,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              },
            )
          );
        }
      })(),
    );
  } else if (!url.search && ASSETS.has(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await (
          await caches.open(CACHE_NAME)
        ).match(url.pathname);
        return cached || fetch(request);
      })(),
    );
  }
});
