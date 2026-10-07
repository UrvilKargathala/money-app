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
      <body className={`min-h-screen bg-sunken antialiased ${jakarta.variable} ${questrial.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: `(() => { try { const theme = localStorage.getItem('moneymind-theme'); const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.classList.toggle('dark', dark); } catch {} })()` }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
