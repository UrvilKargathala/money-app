export type AuditableSubscription = { id: string; service_name: string; amount: number; frequency: string; category_id: string | null; last_used_at: string | null };
export type Finding = { subscription_id: string; audit_type: string; finding: string; recommendation: string; potential_savings: number; detection_key: string };
const monthly = (s: AuditableSubscription) => s.amount / (s.frequency === "annual" ? 12 : s.frequency === "quarterly" ? 3 : 1);
const normalize = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
export function detectSubscriptionAudits(subs: AuditableSubscription[], now = new Date()): Finding[] {
  const findings: Finding[] = [];
  for (const [i, s] of subs.entries()) {
    if (s.last_used_at && now.getTime() - new Date(s.last_used_at).getTime() >= 90 * 86400000) {
      findings.push({ subscription_id: s.id, audit_type: "unused", finding: `${s.service_name}: last recorded use was over 90 days ago.`, recommendation: "Confirm whether you still use this service before cancelling.", potential_savings: monthly(s), detection_key: `unused:${s.id}:${s.last_used_at}` });
    }
    for (const other of subs.slice(i + 1)) {
      const duplicate = normalize(s.service_name) === normalize(other.service_name);
      if (!duplicate && (!s.category_id || s.category_id !== other.category_id)) continue;
      const type = duplicate ? "duplicate" : "overlapping";
      findings.push({ subscription_id: s.id, audit_type: type, finding: duplicate ? `${s.service_name} has another active entry with the same service name.` : `${s.service_name} and ${other.service_name} share a category and may overlap.`, recommendation: duplicate ? "Check whether both entries represent separate charges before removing one." : "Compare what each service provides; sharing a category does not prove duplicate coverage.", potential_savings: Math.min(monthly(s), monthly(other)), detection_key: `${type}:${[s.id, other.id].sort().join(":")}` });
    }
  }
  return findings;
}
