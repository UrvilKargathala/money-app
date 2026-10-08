import { query } from "../db";

export type SearchRow = {
  id: string;
  title: string;
  subtitle: string | null;
  kind: string;
  href: string;
};

/**
 * Global search across transactions/notes/accounts/bills/subscriptions.
 * `escapedTerm` must have LIKE wildcards escaped by the caller; each branch
 * is capped so one huge table can't starve the others before the final LIMIT.
 */
export async function globalSearch(userId: number, escapedTerm: string): Promise<SearchRow[]> {
  const result = await query<SearchRow>(
    `WITH matches AS (
       (SELECT id::text, COALESCE(NULLIF(merchant_clean, ''), NULLIF(description, ''), 'Transaction') AS title,
              CONCAT(type, ' · ₹', amount::text, ' · ', date::text) AS subtitle,
              'transaction'::text AS kind, '/transactions'::text AS href, 1 AS priority
       FROM transactions
       WHERE user_id = $1
         AND (description ILIKE '%' || $2 || '%' ESCAPE '\\' OR merchant_clean ILIKE '%' || $2 || '%' ESCAPE '\\')
       ORDER BY date DESC LIMIT 20)
       UNION ALL
       (SELECT id::text, title, category, 'note', '/notes', 2
       FROM secure_notes
       WHERE user_id = $1 AND deleted_at IS NULL AND title ILIKE '%' || $2 || '%' ESCAPE '\\'
       ORDER BY created_at DESC LIMIT 20)
       UNION ALL
       (SELECT id::text, name, COALESCE(institution, type), 'account', '/accounts', 3
       FROM accounts
       WHERE user_id = $1 AND deleted_at IS NULL
         AND (name ILIKE '%' || $2 || '%' ESCAPE '\\' OR institution ILIKE '%' || $2 || '%' ESCAPE '\\')
       LIMIT 20)
       UNION ALL
       (SELECT id::text, name, CONCAT('Bill · ₹', COALESCE(amount, estimated_amount, 0)::text), 'bill', '/bills', 4
       FROM bills
       WHERE user_id = $1 AND is_active = 1 AND name ILIKE '%' || $2 || '%' ESCAPE '\\'
       LIMIT 20)
       UNION ALL
       (SELECT id::text, service_name, CONCAT('Subscription · ₹', amount::text), 'subscription', '/subscriptions', 5
       FROM subscriptions
       WHERE user_id = $1 AND status <> 'cancelled' AND service_name ILIKE '%' || $2 || '%' ESCAPE '\\'
       LIMIT 20)
     )
     SELECT id, title, subtitle, kind, href FROM matches
     ORDER BY priority, title LIMIT 20`,
    [userId, escapedTerm]
  );
  return result.rows;
}
