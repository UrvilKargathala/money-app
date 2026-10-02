import { getGoalsData, getGoalsDashboard, getAccountsData, getGoalTemplates } from "@/lib/api-client";
import { GoalsDashboard } from "./goals-dashboard";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const [goalsData, dashboardData, accountsData, templatesData] = await Promise.all([
    getGoalsData(),
    getGoalsDashboard(),
    getAccountsData(),
    getGoalTemplates(),
  ]);

  return (
    <GoalsDashboard
      goals={(goalsData?.goals ?? []) as never}
      dashboard={(dashboardData?.dashboard ?? null) as never}
      accounts={(accountsData?.accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
      templates={(templatesData?.templates ?? []) as never}
    />
  );
}
