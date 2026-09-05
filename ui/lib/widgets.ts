export type WidgetDef = {
  id: string;
  label: string;
  description: string;
  premium?: boolean;
};

export const WIDGETS: WidgetDef[] = [
  { id: "networth-sparkline", label: "Net Worth Sparkline", description: "Your net worth over time", premium: true },
  { id: "bills-due", label: "Bills Due 7d", description: "Bills due this week and overdue", premium: false },
  { id: "budget-util", label: "Budget Utilization", description: "Top budgets utilization bars", premium: true },
  { id: "cashflow-mini", label: "Cashflow Mini", description: "Income vs expense last 6 months", premium: true },
  { id: "top-merchants", label: "Top Merchants", description: "Ranked by spend", premium: true },
];

export const FREE_WIDGET_LIMIT = 2;

export function isWidgetPremium(id: string): boolean {
  return !!WIDGETS.find((w) => w.id === id)?.premium;
}
