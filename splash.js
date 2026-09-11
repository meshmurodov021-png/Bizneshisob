/**
 * BiznesHisob launch splash controller.
 * Timing lives on .bh-splash CSS variables — change those, not magic numbers here.
 * Silent. Icon only. Once per browsing session (cold start).
 */
(function () {
  const STORAGE_KEY = "bh_splash_played";
  const splash = document.getElementById("bh-launch-splash");
  const root = document.documentElement;
  const t0 = typeof window.__bhSplashT0 === "number" ? window.__bhSplashT0 : performance.now();

  function msVar(el, name, fallback) {
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return fallback;
    if (raw.endsWith("s") && !raw.endsWith("ms")) return n * 1000;
    return n;
  }

  function waitUntil(elapsedMs) {
    const delay = Math.max(0, elapsedMs - (performance.now() - t0));
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  function markPlayed() {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch (_) {}
  }

  function teardown() {
    if (!splash) return;
    splash.classList.add("bh-splash--done");
    splash.setAttribute("hidden", "");
    splash.remove();
    root.classList.remove("bh-splash-pending");
    if (!root.classList.contains("bh-splash-skip")) {
      root.classList.add("bh-splash-done");
    }
    document.dispatchEvent(new CustomEvent("bh-splash-done"));
  }

  function skipNow() {
    markPlayed();
    teardown();
  }

  window.BiznesHisobSplash = {
    skip: skipNow,
    get playing() {
      return root.classList.contains("bh-splash-pending");
    }
  };

  if (!splash) {
    root.classList.remove("bh-splash-pending");
    return;
  }

  if (root.classList.contains("bh-splash-skip")) {
    skipNow();
    return;
  }

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const iconIn = msVar(splash, "--bh-splash-in", reduce ? 1 : 720);
  const hold = msVar(splash, "--bh-splash-hold", reduce ? 420 : 560);
  const fadeOut = msVar(splash, "--bh-splash-out", reduce ? 380 : 700);
  const exitAt = iconIn + hold;
  const removeAt = exitAt + fadeOut;

  markPlayed();

  waitUntil(exitAt).then(() => {
    if (!splash.isConnected) return;
    splash.classList.add("bh-splash--exit");
  });

  waitUntil(removeAt).then(() => {
    teardown();
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted && sessionStorage.getItem(STORAGE_KEY) === "1") {
      teardown();
    }
  });
})();
