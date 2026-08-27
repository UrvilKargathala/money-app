import { PlaceholderPage } from "@/components/common/placeholder-page";

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
  return <PlaceholderPage title={meta.title} description={meta.description} module={module} />;
}
