import { revalidatePath } from "next/cache";
import { apiFetchRaw } from "@/lib/api-client";
import type { ActionState } from "@moneymind/api";

/**
 * Shared tail for server-action mutations: POST/PATCH/DELETE via the
 * in-process API, uniform {error, fieldErrors} shaping, then revalidation.
 * Replaces ~80 copy-pasted `apiFetchRaw + res.json + revalidatePath` blocks.
 */
export async function mutateAndRevalidate(
  path: string,
  opts: {
    method?: string;
    json?: unknown;
    /** Fallback when the API returns non-2xx without its own message. */
    fallback?: string;
    /** Map the error body to a message (overrides body.error). */
    formatError?: (body: { error?: string; fieldErrors?: unknown }) => string;
    /** Paths to revalidate on success. */
    revalidate: string[];
  }
): Promise<ActionState> {
  const res = await apiFetchRaw(path, { method: opts.method ?? "POST", json: opts.json });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      error: opts.formatError ? opts.formatError(body) : body.error || opts.fallback || "Something went wrong. Please try again.",
      ...(body.fieldErrors ? { fieldErrors: body.fieldErrors } : {}),
    };
  }
  for (const p of opts.revalidate) revalidatePath(p);
  return { success: true };
}
