import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  PiggyBank,
  Receipt,
  Repeat,
  Target,
  BarChart3,
  Plus,
  Search,
  Settings,
  Bell,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Shortcut = {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  keywords: string[];
  href?: string;
  action?: () => void;
  recommended?: boolean;
  premium?: boolean;
};

export const SHORTCUTS: Shortcut[] = [
  { id: "new-transaction", label: "New Transaction", description: "Add income, expense or transfer", icon: Plus, keywords: ["add", "transaction", "expense"], href: "/add", recommended: true },
  { id: "new-account", label: "New Account", description: "Create a new account", icon: Wallet, keywords: ["account", "create"], href: "/money/accounts?create=1" },
  { id: "new-budget", label: "New Budget", description: "Create a monthly budget", icon: PiggyBank, keywords: ["budget", "create"], href: "/money/budgets?create=1" },
  { id: "new-bill", label: "New Bill", description: "Add a bill and due date", icon: Receipt, keywords: ["bill", "create"], href: "/money/bills?create=1" },
  { id: "go-dashboard", label: "Go to Dashboard", icon: LayoutDashboard, keywords: ["dashboard", "home"], href: "/overview/dashboard", recommended: true },
  { id: "go-transactions", label: "Go to Transactions", icon: ArrowLeftRight, keywords: ["transactions", "list"], href: "/money/transactions" },
  { id: "go-budgets", label: "Go to Budgets", icon: PiggyBank, keywords: ["budget", "plan"], href: "/money/budgets" },
  { id: "go-bills", label: "View Bills Upcoming", icon: Receipt, keywords: ["bills", "upcoming", "due"], href: "/money/bills" },
  { id: "go-subscriptions", label: "View Subscriptions", icon: Repeat, keywords: ["subscriptions", "monthly"], href: "/money/subscriptions" },
  { id: "go-reports", label: "Go to Reports", icon: BarChart3, keywords: ["reports", "analytics"], href: "/overview/reports", recommended: true },
  { id: "go-goals", label: "View Goals", icon: Target, keywords: ["goals", "target"], href: "/wealth/goals" },
  { id: "search", label: "Search", description: "Search transactions, notes, bills", icon: Search, keywords: ["search", "find"], action: () => document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')?.focus() },
  { id: "notifications", label: "View Notifications", icon: Bell, keywords: ["notifications", "alerts"], href: "/notifications" },
  { id: "settings", label: "Open Settings", icon: Settings, keywords: ["settings", "preferences"], href: "/settings" },
];

export function filterShortcuts(query: string, list: Shortcut[] = SHORTCUTS): Shortcut[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((s) => {
    const hay = `${s.label} ${s.description ?? ""} ${s.keywords.join(" ")}`.toLowerCase();
    return hay.includes(q);
  });
}
