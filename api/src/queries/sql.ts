/**
 * Shared SQL fragments for tenant-guarded lookups. Replaces copy-pasted
 * JOIN blocks across bills/subscriptions/export queries. Fragments are
 * static except table aliases (validated identifiers) — no user input
 * ever reaches these builders.
 */

function assertAlias(value: string): void {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) throw new Error(`Invalid SQL alias: ${value}`);
}

/** LEFT JOIN accounts <as> ON <as>.id = <owner>.account_id AND tenant match. */
export function joinAccount(owner: string, as = "a"): string {
  assertAlias(owner);
  assertAlias(as);
  return `LEFT JOIN accounts ${as} ON ${as}.id = ${owner}.account_id AND ${as}.user_id = ${owner}.user_id`;
}

/**
 * LEFT JOIN categories <as> — tenant match OR shared system row
 * (system categories have NULL user_id and must stay visible).
 */
export function joinCategory(owner: string, as = "cat"): string {
  assertAlias(owner);
  assertAlias(as);
  return `LEFT JOIN categories ${as} ON ${as}.id = ${owner}.category_id AND (${as}.user_id = ${owner}.user_id OR ${as}.is_system = 1)`;
}

/** Latest payment_history row for a payable (bill/subscription/...). */
export function lateralLastPayment(owner: string, payableType: string, as = "ph"): string {
  assertAlias(owner);
  assertAlias(as);
  if (!/^[a-z_]+$/.test(payableType)) throw new Error(`Invalid payable type: ${payableType}`);
  return `LEFT JOIN LATERAL (
    SELECT created_at, amount FROM payment_history
    WHERE user_id = ${owner}.user_id AND payable_type = '${payableType}' AND payable_id = ${owner}.id
    ORDER BY created_at DESC LIMIT 1
  ) ${as} ON true`;
}
