export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  const payload = { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined, route: typeof window !== "undefined" ? window.location.pathname : undefined, timestamp: new Date().toISOString(), ...context };
  console.error("[moneymind.client.error]", payload);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("moneymind:error", { detail: payload }));
}
