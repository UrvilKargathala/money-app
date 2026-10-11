"use client";

import { useTheme } from "@/components/common/theme-provider";

/**
 * Chart chrome theming (axes, grid, tooltip, legend). Data series colors
 * stay identical in both themes - only the frame around the data converts,
 * sourced from the DS Dark column.
 */
export type ChartTheme = {
  tick: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  legendText: string;
  cursor: string;
};

const LIGHT: ChartTheme = {
  tick: "#64748B",
  grid: "#E2E8F0",
  tooltipBg: "#FFFFFF",
  tooltipBorder: "#E2E8F0",
  tooltipText: "#0F172A",
  legendText: "#475569",
  cursor: "#F1F5F9",
};

const DARK: ChartTheme = {
  tick: "#94A3B8",
  grid: "#334155",
  tooltipBg: "#0F172A",
  tooltipBorder: "#334155",
  tooltipText: "#F8FAFC",
  legendText: "#CBD5E1",
  cursor: "#1E293B",
};

/**
 * Reads the single theme source (ThemeProvider). Previously each chart
 * mounted its own MutationObserver on <html>; now one matchMedia listener
 * in the provider serves all charts. Same return contract - SSR renders
 * light first, provider corrects on hydration.
 */
export function useDarkMode(): boolean {
  return useTheme().dark;
}

export function chartTheme(dark: boolean): ChartTheme {
  return dark ? DARK : LIGHT;
}
