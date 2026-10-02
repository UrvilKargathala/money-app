import { getNetWorthData, getNetWorthTrend, getManualAssetsData } from "@/lib/api-client";
import { NetWorthDashboard } from "./net-worth-dashboard";

export const dynamic = "force-dynamic";

export default async function NetWorthPage() {
  const [netWorthData, trendData, manualAssetsData] = await Promise.all([getNetWorthData(), getNetWorthTrend("6M"), getManualAssetsData()]);

  return (
    <NetWorthDashboard
      netWorth={(netWorthData as unknown as { netWorth: number })?.netWorth ?? (netWorthData as unknown as { net_worth: number })?.net_worth ?? null}
      assets={(netWorthData as unknown as { assets: number })?.assets ?? null}
      liabilities={(netWorthData as unknown as { liabilities: number })?.liabilities ?? null}
      trend={(trendData?.trend ?? []) as never}
      manualAssets={(manualAssetsData?.assets ?? []) as never}
    />
  );
}
