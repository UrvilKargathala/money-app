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
  { id: "new-account", label: "New Account", description: "Create a new account", icon: Wallet, keywords: ["account", "create"], href: "/accounts" },
  { id: "go-dashboard", label: "Go to Dashboard", icon: LayoutDashboard, keywords: ["dashboard", "home"], href: "/dashboard", recommended: true },
  { id: "go-transactions", label: "Go to Transactions", icon: ArrowLeftRight, keywords: ["transactions", "list"], href: "/transactions" },
  { id: "go-budgets", label: "Go to Budgets", icon: PiggyBank, keywords: ["budget", "plan"], href: "/budgets" },
  { id: "go-bills", label: "View Bills Upcoming", icon: Receipt, keywords: ["bills", "upcoming", "due"], href: "/bills" },
  { id: "go-subscriptions", label: "View Subscriptions", icon: Repeat, keywords: ["subscriptions", "monthly"], href: "/subscriptions" },
  { id: "go-reports", label: "Go to Reports", icon: BarChart3, keywords: ["reports", "analytics"], href: "/reports", recommended: true },
  { id: "go-goals", label: "View Goals", icon: Target, keywords: ["goals", "target"], href: "/goals" },
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
