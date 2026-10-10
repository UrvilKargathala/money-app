import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Questrial } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-heading",
});

const questrial = Questrial({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-body",
});

// Absolute base for OG/Twitter image URLs. Explicit site URL wins, then the
// Vercel production domain, then local APP_URL; localhost is dev-only.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : null) ??
  process.env.APP_URL ??
  "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "MoneyMind - Personal Finance Manager",
    template: "%s | MoneyMind",
  },
  description:
    "MoneyMind tracks budgets, bills, subscriptions, investments, debts and goals in one secure personal finance app.",
  robots: { index: true, follow: true },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
  openGraph: {
    title: "MoneyMind - Personal Finance Manager",
    description:
      "MoneyMind tracks budgets, bills, subscriptions, investments, debts and goals in one secure personal finance app.",
    type: "website",
    siteName: "MoneyMind",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: "MoneyMind - Personal Finance Manager",
    description:
      "MoneyMind tracks budgets, bills, subscriptions, investments, debts and goals in one secure personal finance app.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2563EB" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`min-h-screen bg-sunken antialiased ${jakarta.variable} ${questrial.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: `(() => { try { const theme = localStorage.getItem('moneymind-theme'); const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.classList.toggle('dark', dark); } catch {} })()` }} />
        <a href="#main-content" className="sr-only z-[100] rounded-md bg-surface px-4 py-2 text-ink-1 shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to main content</a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
