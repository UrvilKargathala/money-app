import { EmptyState } from "@/components/common/empty-state";

const moduleMeta: Record<string, { title: string; description: string }> = {
  bills: { title: "Bills", description: "Track your recurring bills and due dates" },
  subscriptions: { title: "Subscriptions", description: "Manage your subscriptions and monthly burn" },
  goals: { title: "Goals", description: "Track your savings goals and contributions" },
  debts: { title: "Debts & Loans", description: "Manage loans, EMIs, and payoff strategies" },
  tax: { title: "Tax Planning", description: "Section 80C/D tracking and regime comparison" },
  investments: { title: "Investments", description: "Portfolio tracking and XIRR returns" },
  "net-worth": { title: "Net Worth", description: "Wealth snapshot and trend" },
  reports: { title: "Reports", description: "Analytics, cashflow, and spending insights" },
  notes: { title: "Secure Notes", description: "Encrypted vault for sensitive notes" },
  calendar: { title: "Financial Calendar", description: "Unified calendar of all financial events" },
  notifications: { title: "Notifications", description: "Alerts and reminders center" },
};

export default async function ModulePlaceholder({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const meta = moduleMeta[module] || { title: module, description: `The ${module} module` };
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-heading text-foreground">{meta.title}</h1>
        <p className="text-sm text-faint font-body mt-1">{meta.description}</p>
      </div>
      <EmptyState
        title="Coming Soon"
        description={`The ${module} module is under construction. This module will be available in the next update. Check back soon or explore the available modules from the sidebar.`}
        actionLabel="Back to Dashboard"
        href="/overview/dashboard"
      />
    </div>
  );
}
