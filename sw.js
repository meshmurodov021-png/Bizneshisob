const BUILD_VERSION = "1780673729574";
const CACHE_VERSION = `bizneshisob-${BUILD_VERSION}`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith("bizneshisob-") && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: "SW_ACTIVATED", version: BUILD_VERSION });
          });
        })
      )
  );
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isNavigationRequest(request) {
  return request.mode === "navigate" ||
    (request.method === "GET" && request.headers.get("accept")?.includes("text/html"));
}

function isFirebaseCdn(url) {
  return url.hostname === "www.gstatic.com" && url.pathname.includes("/firebasejs/");
}

function isFirebaseApi(url) {
  return url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("firebasestorage.app") ||
    url.hostname.includes("cloudusersettings") ||
    (url.hostname.includes("firebaseapp.com") && url.pathname.includes("__"));
}

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (isFirebaseApi(url)) {
    return;
  }

  if (isFirebaseCdn(url)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname === "/sw.js" || url.pathname.endsWith("/sw.js")) {
      event.respondWith(networkOnly(request));
      return;
    }
    if (isNavigationRequest(request)) {
      event.respondWith(networkFirstNavigation(request));
      return;
    }
    if (url.pathname === "/index.html" || url.pathname === "/version.json") {
      event.respondWith(networkFirstAsset(request, SHELL_CACHE));
      return;
    }
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
});

async function networkOnly(request) {
  return fetch(request);
}

async function networkFirstAsset(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return Response.error();
  }
}

const NAV_NETWORK_TIMEOUT_MS = 3000;

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);

  const networkPromise = fetch(request, { cache: "no-store" })
    .then(response => {
      if (response.ok) {
        cache.put("/index.html", response.clone());
        cache.put("/", response.clone());
      }
      return response;
    });

  const cached = await cache.match("/index.html") || await cache.match("/");

  // Kesh bor bo'lsa: tarmoq sekin bo'lganda (>3s) darhol keshdan ochamiz,
  // yangi versiya fonda keshga yozilib boradi.
  if (cached) {
    const winner = await Promise.race([
      networkPromise.catch(() => null),
      new Promise(resolve => setTimeout(() => resolve(null), NAV_NETWORK_TIMEOUT_MS))
    ]);
    return winner || cached;
  }

  try {
    return await networkPromise;
  } catch {
    return new Response(
      "<!DOCTYPE html><html lang=\"uz\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>BiznesHisob</title><style>body{font-family:system-ui;background:#0c0e14;color:#e8eaef;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}</style></head><body><h1>BiznesHisob</h1><p>Internet yoʻq. Ilovani ochish uchun onlayn boʻling.</p></body></html>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || (await fetchPromise) || Response.error();
}
