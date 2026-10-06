import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "MoneyMind - Personal Finance Manager",
  description: "Take control of your finances with MoneyMind",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2563EB",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-sunken antialiased">
        <script dangerouslySetInnerHTML={{ __html: `(() => { try { const theme = localStorage.getItem('moneymind-theme'); const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.classList.toggle('dark', dark); } catch {} })()` }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
