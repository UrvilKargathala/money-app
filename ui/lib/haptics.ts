"use client";

// Central haptic helper: respects user_settings.haptics_enabled + platform.
// Web fallback uses navigator.vibrate; native uses @capacitor/haptics if available.

type HapticType = "light" | "medium" | "success" | "error" | "selection";

let enabledCache: boolean | null = null;
let cachedAt = 0;

async function isEnabled(): Promise<boolean> {
  // Cache 60s to avoid hammering settings endpoint
  if (enabledCache !== null && Date.now() - cachedAt < 60000) return enabledCache;
  try {
    const res = await fetch("/api/users/me/settings", { cache: "no-store", credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      // API may return { settings: { haptics_enabled } } or direct
      const v = data?.settings?.haptics_enabled ?? data?.haptics_enabled;
      if (v !== undefined) {
        enabledCache = !!Number(v);
        cachedAt = Date.now();
        return enabledCache;
      }
    }
  } catch {}
  // Default enabled if fetch fails (optimistic)
  enabledCache = true;
  return true;
}

export function setHapticsEnabledCache(v: boolean) {
  enabledCache = v;
  cachedAt = Date.now();
}

export async function haptic(type: HapticType = "light"): Promise<void> {
  if (!(await isEnabled())) return;

  // Try Capacitor Haptics if running natively (optional dep, gracefully skip if not installed)
  try {
    // @ts-ignore - optional dependency, may not be installed in web build
    const mod: unknown = await import("@capacitor/haptics").catch(() => null);
    const Haptics = (mod as { Haptics?: { impact: (o: unknown) => Promise<void>; selectionChanged: () => Promise<void>; notification: (o: unknown) => Promise<void> } })?.Haptics;
    if (Haptics) {
      if (type === "selection") {
        await Haptics.selectionChanged();
        return;
      }
      if (type === "success" || type === "error") {
        await Haptics.notification({ type: type === "success" ? "SUCCESS" : "ERROR" });
        return;
      }
      const style = type === "medium" ? "MEDIUM" : "HEAVY";
      // light vs medium mapping
      const finalStyle = type === "medium" ? style : "LIGHT";
      await Haptics.impact({ style: finalStyle });
      return;
    }
  } catch {}

  // Web fallback
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      const pattern =
        type === "success" ? [10, 30, 10] : type === "error" ? [20, 20, 20] : type === "medium" ? [20] : [10];
      (navigator as unknown as { vibrate: (p: number | number[]) => void }).vibrate(pattern as unknown as number);
    }
  } catch {}
}

// Fire-and-forget wrapper for onClick handlers (no await needed in JSX)
export function triggerHaptic(type: HapticType = "light"): void {
  void haptic(type);
}
