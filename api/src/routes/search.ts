import { Hono } from "hono";
import { query } from "../db";
import { requireAuth } from "../middleware";

type SearchRow = { id: string; title: string; subtitle: string | null; kind: string; href: string };

const search = new Hono();

search.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const term = (c.req.query("q") ?? "").trim();
  if (term.length < 2) return c.json({ results: [] });

  const result = await query<SearchRow>(
    `WITH matches AS (
       SELECT id::text, COALESCE(NULLIF(merchant_clean, ''), NULLIF(description, ''), 'Transaction') AS title,
              CONCAT(type, ' · ₹', amount::text, ' · ', date::text) AS subtitle,
              'transaction'::text AS kind, '/transactions'::text AS href, 1 AS priority
       FROM transactions
       WHERE user_id = $1
         AND (description ILIKE '%' || $2 || '%' OR merchant_clean ILIKE '%' || $2 || '%')
       UNION ALL
       SELECT id::text, title, category, 'note', '/notes', 2
       FROM secure_notes
       WHERE user_id = $1 AND deleted_at IS NULL AND title ILIKE '%' || $2 || '%'
       UNION ALL
       SELECT id::text, name, COALESCE(institution, type), 'account', '/accounts', 3
       FROM accounts
       WHERE user_id = $1 AND deleted_at IS NULL
         AND (name ILIKE '%' || $2 || '%' OR institution ILIKE '%' || $2 || '%')
       UNION ALL
       SELECT id::text, name, CONCAT('Bill · ₹', COALESCE(amount, estimated_amount, 0)::text), 'bill', '/bills', 4
       FROM bills
       WHERE user_id = $1 AND is_active = 1 AND name ILIKE '%' || $2 || '%'
       UNION ALL
       SELECT id::text, service_name, CONCAT('Subscription · ₹', amount::text), 'subscription', '/subscriptions', 5
       FROM subscriptions
       WHERE user_id = $1 AND status <> 'cancelled' AND service_name ILIKE '%' || $2 || '%'
     )
     SELECT id, title, subtitle, kind, href FROM matches
     ORDER BY priority, title LIMIT 20`,
    [user.user_id, term],
  );
  return c.json({ results: result.rows });
});

export { search };
