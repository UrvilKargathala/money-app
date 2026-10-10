import type { Metadata } from "next";
import LoginForm from "./login-form";

// Brand-term page: indexed with a unique title/description/canonical,
// overriding the (auth) segment noindex default.
export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to MoneyMind to manage budgets, bills, subscriptions and investments.",
  alternates: { canonical: "/login" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Sign in | MoneyMind",
    description: "Sign in to MoneyMind to manage budgets, bills, subscriptions and investments.",
    url: "/login",
  },
};

export default function LoginPage() {
  return <LoginForm />;
}
