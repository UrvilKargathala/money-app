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
};

export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/overview/dashboard", icon: LayoutDashboard },
  { label: "Accounts", href: "/money/accounts", icon: Wallet},
  { label: "Transactions", href: "/money/transactions", icon: ArrowLeftRight},
  { label: "Budgets", href: "/money/budgets", icon: PiggyBank},
];

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/overview/dashboard", icon: LayoutDashboard },
      { label: "Net Worth", href: "/overview/net-worth", icon: Scale},
      { label: "Reports", href: "/overview/reports", icon: BarChart3},
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Accounts", href: "/money/accounts", icon: Wallet},
      { label: "Transactions", href: "/money/transactions", icon: ArrowLeftRight},
      { label: "Budgets", href: "/money/budgets", icon: PiggyBank},
      { label: "Bills", href: "/money/bills", icon: Receipt},
      { label: "Subscriptions", href: "/money/subscriptions", icon: Repeat},
      { label: "Recurring", href: "/money/recurring", icon: Repeat},
    ],
  },
  {
    label: "Wealth",
    items: [
      { label: "Investments", href: "/wealth/investments", icon: TrendingUp},
      { label: "Debts", href: "/wealth/debts", icon: Landmark},
      { label: "Goals", href: "/wealth/goals", icon: Target},
    ],
  },
  {
    label: "Planning & Records",
    items: [
      { label: "Calendar", href: "/planning/calendar", icon: Calendar},
      { label: "Tax", href: "/planning/tax", icon: Calculator},
      { label: "Notes", href: "/planning/notes", icon: FileText},
      { label: "Shared Groups", href: "/planning/shared-groups", icon: Users},
    ],
  },
];

export const STANDALONE_NAV_ITEMS: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings },
];

// Kept for full-page navigation via bell -> View all
export const NOTIFICATION_NAV_ITEM: NavItem = { label: "Notifications", href: "/notifications", icon: Bell };
