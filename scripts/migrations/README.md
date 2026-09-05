# MoneyMind membership

The application uses Neon PostgreSQL through `pg` and its existing custom authentication. The deployed schema uses integer user identities. This additive migration extends `users`; it creates no new user-reference columns and does not introduce Supabase Auth.

## Apply and verify

Run `node scripts/migrate.mjs` from the repository root. It loads the application's local environment and runs the idempotent migration in a transaction. `--neon` uses the direct connection from the git-ignored `.env.neon.local`. Never run the destructive `db_setup.py` on an existing database; that script is only for fresh development/test databases.

Verification:

- `pnpm typecheck` and `pnpm build`.
- From `api/`: `pnpm exec vitest run --config vitest.membership.config.ts` (no database).
- `node scripts/verify-membership.mjs`: isolated schema and rollback-only database assertions.
- `node scripts/verify-membership-api.mjs`: live localhost:3016 checks with one temporary account, cleaned up in `finally`.
- Existing full integration tests require an explicit isolated `TEST_DATABASE_URL` when the application uses Neon. The general module fixtures and newly seeded demo accounts are premium so that they can exercise all modules; signups still default to Starter. Never point `TEST_DATABASE_URL` at application data.

## Entitlements and limits

`api/src/entitlements.ts` owns the free/premium decision. Growth (₹149 monthly), Wealth (₹999 annually), and Legacy (₹2,999 once) use exactly the same premium access. Billing metadata does not determine feature access. The pricing page is public at `/pricing`; selecting a paid plan does not change membership or initiate payment.

Starter capacity counts active, non-deleted accounts; distinct active budget categories across periods; active bills; non-cancelled subscriptions (including paused); and active goals. Repeating a budget category in another month uses no extra slot. The limits are 2/2/5/3/1 respectively. Triggers lock the owning user row to serialize capacity checks, including imports, template application, and reactivation. Existing over-limit records are preserved and editable; additions and reactivations require capacity or premium. Normal handlers return `403 STARTER_LIMIT` with an upgrade link.

Legacy member numbers must be unique and between 1 and 1,000. The non-cycling `legacy_member_numbers` sequence is available for the future trusted billing workflow; allocate with `nextval` inside that workflow and never reset it. There is intentionally no client-accessible endpoint for granting premium or changing billing metadata.

Starter replaces the previous session when signing in; premium permits multiple concurrent sessions against the same persisted data. Privacy exports, deactivation, and restore retain their existing free access. No new downgrade or automatic expiry behavior is implemented pending lifecycle policy decisions.

## Audits and widgets

Audits track actual saved price/frequency changes, normalize names for possible duplicates, and mark shared categories as possible overlaps rather than proven redundant services. Unused detection requires an explicit last-used date over 90 days old; use the subscription card's date control. Findings retain dismissal state across rescans. Savings are indicative and may overlap, not guaranteed savings.

Premium widgets read live endpoint data, including net-worth sparklines. Settings supports drag/drop and keyboard-accessible up/down ordering with server persistence. Starter email toggles are disabled and email-enabled writes are rejected. The current application still owns notification delivery; this pass does not add an email provider.

The cashflow forecast is the average of the previous three completed calendar months, with empty months counted as zero. Its assumptions are displayed with the result.

## Follow-up decisions (not implemented)

Payment provider/checkout/webhooks, GST treatment, refund and cancellation policy, expiry/downgrade data retention, trials, and investment/tax disclaimer copy remain undecided. Dark theme is not shipped. The referenced pricing artifact, P2 document, and `MoneyMind_Design_System.md` were absent, so pricing uses existing UI primitives plus the supplied typography, indigo/gold palette, prices, and feature-parity requirements.
