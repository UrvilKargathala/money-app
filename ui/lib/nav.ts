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
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  built: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, built: true },
  { label: "Accounts", href: "/accounts", icon: Wallet, built: true },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight, built: true },
  { label: "Budgets", href: "/budgets", icon: PiggyBank, built: true },
  { label: "Bills", href: "/bills", icon: Receipt, built: true },
  { label: "Subscriptions", href: "/subscriptions", icon: Repeat, built: true },
  { label: "Goals", href: "/goals", icon: Target, built: true },
  { label: "Debts", href: "/debts", icon: Landmark, built: true },
  { label: "Tax", href: "/tax", icon: Calculator, built: true },
  { label: "Investments", href: "/investments", icon: TrendingUp, built: true },
  { label: "Net Worth", href: "/net-worth", icon: Scale, built: true },
  { label: "Reports", href: "/reports", icon: BarChart3, built: true },
  { label: "Notes", href: "/notes", icon: FileText, built: true },
  { label: "Calendar", href: "/calendar", icon: Calendar, built: true },
  { label: "Notifications", href: "/notifications", icon: Bell, built: true },
  { label: "Settings", href: "/settings", icon: Settings, built: true },
];

export const BOTTOM_NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: LayoutDashboard, built: true },
  { label: "Accounts", href: "/accounts", icon: Wallet, built: true },
  { label: "Transactions", href: "/transactions", icon: ArrowLeftRight, built: true },
  { label: "Budgets", href: "/budgets", icon: PiggyBank, built: true },
];

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, built: true },
      { label: "Net Worth", href: "/net-worth", icon: Scale, built: true },
      { label: "Reports", href: "/reports", icon: BarChart3, built: true },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Accounts", href: "/accounts", icon: Wallet, built: true },
      { label: "Transactions", href: "/transactions", icon: ArrowLeftRight, built: true },
      { label: "Budgets", href: "/budgets", icon: PiggyBank, built: true },
      { label: "Bills", href: "/bills", icon: Receipt, built: true },
      { label: "Subscriptions", href: "/subscriptions", icon: Repeat, built: true },
    ],
  },
  {
    label: "Wealth",
    items: [
      { label: "Investments", href: "/investments", icon: TrendingUp, built: true },
      { label: "Debts", href: "/debts", icon: Landmark, built: true },
      { label: "Goals", href: "/goals", icon: Target, built: true },
    ],
  },
  {
    label: "Planning & Records",
    items: [
      { label: "Calendar", href: "/calendar", icon: Calendar, built: true },
      { label: "Tax", href: "/tax", icon: Calculator, built: true },
      { label: "Notes", href: "/notes", icon: FileText, built: true },
    ],
  },
];

export const STANDALONE_NAV_ITEMS: NavItem[] = [
  { label: "Notifications", href: "/notifications", icon: Bell, built: true },
  { label: "Settings", href: "/settings", icon: Settings, built: true },
];
