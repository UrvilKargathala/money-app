/**
 * Client-safe billing helpers (browser only).
 *
 * Unlike `@/lib/api-client` (server-only: uses `next/headers` + in-process
 * Hono), this module uses plain same-origin `fetch` so it can be imported
 * from `"use client"` components. The browser attaches the session cookie
 * automatically; the API route forwards to the Hono backend.
 */

export async function createBillingCheckout(
  plan: "monthly" | "annual" | "lifetime"
): Promise<{ url: string | null; id: string } | null> {
  try {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { url: string | null; id: string };
  } catch {
    return null;
  }
}
