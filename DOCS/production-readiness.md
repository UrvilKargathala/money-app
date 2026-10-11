# Production readiness checklist

Run `pnpm typecheck`, `pnpm build`, `pnpm smoke`, and `pnpm smoke:pages` before release. The API suite covers accounts, transactions, bills, shared groups, notes, imports, reports, authentication guards, rate limits, and cross-user isolation.

For production, run `node scripts/migrate.mjs --neon` and verify migrations `001_membership.sql`, `002_billing_catalog.sql`, and `003_report_filters.sql`. Use a separate Neon database for integration tests. Confirm Neon point-in-time recovery and perform a restore drill without touching application data.

Keep `DATABASE_URL`, `CRON_SECRET`, email, storage, and billing secrets in Vercel Production environment variables only. Rotate any credential exposed in local logs, screenshots, commits, or chat. The scheduled worker is `GET /api/jobs/run` and must receive `x-cron-secret`; verify both unauthorized and authorized requests.

The API emits structured `api_request` events with request ID, route, method, status, and latency. Client API failures are reported by `reportClientError`. Connect these events to Vercel Logs/Drains and alert on 5xx spikes, authentication failures, and cron failures.
