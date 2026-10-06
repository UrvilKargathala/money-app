"use client";

import { useEffect, useState } from "react";

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
  tick: "#8A94A6",
  grid: "#262626",
  tooltipBg: "#111111",
  tooltipBorder: "#2A2A2A",
  tooltipText: "#EAF1FF",
  legendText: "#B9C7DE",
  cursor: "#262626",
};

function isDark(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/** SSR-safe: renders light first, swaps on mount + class changes. */
export function useDarkMode(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(isDark());
    const observer = new MutationObserver(() => setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

export function chartTheme(dark: boolean): ChartTheme {
  return dark ? DARK : LIGHT;
}
