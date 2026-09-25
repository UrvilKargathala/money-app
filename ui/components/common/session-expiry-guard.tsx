"use client";
import { useEffect } from "react";
export function SessionExpiryGuard() {
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        if (!stopped && response.status === 401) {
          const next = `${window.location.pathname}${window.location.search}`;
          window.location.href = `/login?expired=1&next=${encodeURIComponent(next)}`;
        }
      } catch { /* Do not treat temporary network failure as session expiry. */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    const interval = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return null;
}
