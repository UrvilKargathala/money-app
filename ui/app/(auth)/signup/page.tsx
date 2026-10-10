import type { Metadata } from "next";
import SignupForm from "./signup-form";

// Brand-term page: indexed with a unique title/description/canonical,
// overriding the (auth) segment noindex default.
export const metadata: Metadata = {
  title: "Create account",
  description: "Create a free MoneyMind account to track budgets, bills, subscriptions and investments.",
  alternates: { canonical: "/signup" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Create account | MoneyMind",
    description: "Create a free MoneyMind account to track budgets, bills, subscriptions and investments.",
    url: "/signup",
  },
};

export default function SignupPage() {
  return <SignupForm />;
}
