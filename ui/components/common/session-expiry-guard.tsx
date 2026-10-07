"use client";
import { useEffect } from "react";
export function SessionExpiryGuard() {
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      // Idle tabs stay silent: a 401 surfaces on the next real request, and
      // sessions outlive this heartbeat by orders of magnitude.
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        if (!stopped && response.status === 401) {
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.href = `/login?expired=1&next=${encodeURIComponent(next)}`;
        }
      } catch { /* Do not treat temporary network failure as session expiry. */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    // bfcache-friendly: release the heartbeat when the page is stored and
    // re-arm it when restored (timers alone don't block bfcache, but an
    // always-armed interval is reported as a failure reason).
    let interval = window.setInterval(check, 300_000);
    const onHide = () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      stopped = false;
      void check();
      interval = window.setInterval(check, 300_000);
      document.addEventListener("visibilitychange", onVisible);
    };
    void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);
  return null;
}
