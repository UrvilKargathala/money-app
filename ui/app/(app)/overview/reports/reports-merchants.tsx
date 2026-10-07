import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { EmptyState, formatINR, type MerchantRow } from "./reports-shared";

export function MerchantsCard({ topMerchants }: { topMerchants: MerchantRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Top Merchants</CardTitle>
        <CardDescription>Ranked by total spend</CardDescription>
      </CardHeader>
      <CardContent>
        {topMerchants.length === 0 ? (
          <EmptyState message="No merchant data yet." />
        ) : (
          <div className="space-y-3">
            {topMerchants.map((m) => (
              <div key={m.merchant} className="flex items-center justify-between rounded-lg border border-line p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium font-heading text-ink-1 truncate">{m.merchant}</p>
                  <p className="text-xs text-ink-3">
                    {m.txn_count} txns · avg {formatINR(m.avg_amount)} {m.recurring === 1 && <span className="ml-1 inline-flex items-center rounded-full bg-tint-warning px-1.5 py-0.5 text-[10px] font-medium text-warning-dark dark:bg-[#78350F]/60 dark:text-[#FDE68A]">recurring</span>}
                  </p>
                </div>
                <span className="text-sm font-semibold font-heading text-ink-1">{formatINR(m.total)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
