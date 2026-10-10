"use client";

import { useEffect } from "react";

// Global Cmd/Ctrl+K hook. Lives in its own module (zero Radix imports) so
// eager callers like Topbar don't drag the Dialog chain into their bundle.
// command-palette.tsx re-exports this for back-compat.
export function useCommandPaletteHotkey(onOpen: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
