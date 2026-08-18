import { handle } from "hono/vercel";
import { app } from "./app";

/**
 * Next.js App Router adapter for the MoneyMind API. The web app mounts this
 * at `/api/[[...route]]`; it never imports `hono` directly.
 */
export const apiHandler = handle(app);