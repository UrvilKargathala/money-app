export function trackFeature(name: string, properties: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({ name, properties });
  if (navigator.sendBeacon) navigator.sendBeacon("/api/analytics/events", new Blob([payload], { type: "application/json" }));
  else void fetch("/api/analytics/events", { method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true });
}
