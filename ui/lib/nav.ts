import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  PiggyBank,
  Receipt,
  Repeat,
  Target,
  Landmark,
  Calculator,
  TrendingUp,
  Scale,
  BarChart3,
  FileText,
  Calendar,
  Bell,
  Settings,
  Users,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  built: boolean;
};

export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/overview/dashboard", icon: LayoutDashboard, built: true },
  { label: "Accounts", href: "/money/accounts", icon: Wallet, built: true },
  { label: "Transactions", href: "/money/transactions", icon: ArrowLeftRight, built: true },
  { label: "Budgets", href: "/money/budgets", icon: PiggyBank, built: true },
];

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/overview/dashboard", icon: LayoutDashboard, built: true },
      { label: "Net Worth", href: "/overview/net-worth", icon: Scale, built: true },
      { label: "Reports", href: "/overview/reports", icon: BarChart3, built: true },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Accounts", href: "/money/accounts", icon: Wallet, built: true },
      { label: "Transactions", href: "/money/transactions", icon: ArrowLeftRight, built: true },
      { label: "Budgets", href: "/money/budgets", icon: PiggyBank, built: true },
      { label: "Bills", href: "/money/bills", icon: Receipt, built: true },
      { label: "Subscriptions", href: "/money/subscriptions", icon: Repeat, built: true },
      { label: "Recurring", href: "/money/recurring", icon: Repeat, built: true },
    ],
  },
  {
    label: "Wealth",
    items: [
      { label: "Investments", href: "/wealth/investments", icon: TrendingUp, built: true },
      { label: "Debts", href: "/wealth/debts", icon: Landmark, built: true },
      { label: "Goals", href: "/wealth/goals", icon: Target, built: true },
    ],
  },
  {
    label: "Planning & Records",
    items: [
      { label: "Calendar", href: "/planning/calendar", icon: Calendar, built: true },
      { label: "Tax", href: "/planning/tax", icon: Calculator, built: true },
      { label: "Notes", href: "/planning/notes", icon: FileText, built: true },
      { label: "Shared Groups", href: "/planning/shared-groups", icon: Users, built: true },
    ],
  },
];

export const STANDALONE_NAV_ITEMS: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings, built: true },
];

// Kept for full-page navigation via bell -> View all
export const NOTIFICATION_NAV_ITEM: NavItem = { label: "Notifications", href: "/notifications", icon: Bell, built: true };
