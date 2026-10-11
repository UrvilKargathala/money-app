import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ["var(--font-heading)", '"Plus Jakarta Sans"', "sans-serif"],
        body: ["var(--font-body)", '"Questrial"', "sans-serif"],
      },
      colors: {
        base: "rgb(var(--base) / <alpha-value>)",
        deep: "rgb(var(--deep) / <alpha-value>)",
        soft: "rgb(var(--soft) / <alpha-value>)",
        edge: "rgb(var(--edge) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        "muted-foreground": "rgb(var(--muted-foreground) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",
        "info-soft": "rgb(var(--info-soft) / <alpha-value>)",
        "success-soft": "rgb(var(--success-soft) / <alpha-value>)",
        "warning-soft": "rgb(var(--warning-soft) / <alpha-value>)",
        "error-soft": "rgb(var(--error-soft) / <alpha-value>)",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        primary: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          DEFAULT: "#2563EB",
          foreground: "#FFFFFF",
        },
        neutral: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
        },
        success: {
          light: "#ECFDF5",
          DEFAULT: "#10B981",
          dark: "#065F46",
        },
        warning: {
          light: "#FFFBEB",
          DEFAULT: "#F59E0B",
          dark: "#92400E",
        },
        error: {
          light: "#FEF2F2",
          DEFAULT: "#EF4444",
          dark: "#991B1B",
        },
        info: {
          light: "#EFF6FF",
          DEFAULT: "#3B82F6",
          dark: "#1E40AF",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          // rgb(): --muted-foreground holds RGB channels (deprecated hsl()
          // here computed white — see fix commit).
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "24px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0, 0, 0, 0.04)",
        md: "0 2px 8px rgba(0, 0, 0, 0.04)",
        lg: "0 4px 16px rgba(0, 0, 0, 0.06)",
        xl: "0 8px 32px rgba(0, 0, 0, 0.08)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
