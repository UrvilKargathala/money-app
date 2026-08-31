"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { filterShortcuts, SHORTCUTS } from "@/lib/shortcuts";
import { triggerHaptic } from "@/lib/haptics";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const results = useMemo(() => filterShortcuts(query), [query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const handleSelect = (href?: string, action?: () => void) => {
    triggerHaptic("selection");
    onOpenChange(false);
    if (action) action();
    else if (href) router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-[560px] overflow-hidden rounded-2xl border-0 shadow-2xl">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
          <Search className="h-5 w-5 text-neutral-400" />
          <Input
            autoFocus
            placeholder="Search commands — try 'new transaction', 'reports', 'bills'…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 h-8 px-0"
          />
          <span className="hidden sm:inline-flex items-center rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">ESC</span>
        </div>

        <div className="max-h-[380px] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">No shortcuts found for “{query}”.</p>
          ) : (
            <div className="space-y-4 p-1">
              {/* Recommended */}
              {filterShortcuts("", SHORTCUTS.filter((s) => s.recommended)).length > 0 && !query && (
                <div>
                  <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-widest text-neutral-400 uppercase flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> Recommended
                  </p>
                  <div className="space-y-1">
                    {SHORTCUTS.filter((s) => s.recommended).map((s) => {
                      const Icon = s.icon;
                      return (
                        <button
                          key={s.id}
                          onClick={() => handleSelect(s.href, s.action)}
                          className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-neutral-50 transition-colors"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium font-heading text-neutral-900">{s.label}</p>
                            {s.description && <p className="text-xs text-neutral-500">{s.description}</p>}
                          </div>
                          <Badge variant="info" className="bg-teal-900 text-teal-400 border-0">Recommended</Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* All / filtered */}
              <div>
                <p className="px-2 pb-1.5 text-[11px] font-semibold tracking-widest text-neutral-400 uppercase">{query ? `Results (${results.length})` : "All shortcuts"}</p>
                <div className="space-y-1">
                  {results.map((s) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleSelect(s.href, s.action)}
                        className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-neutral-50 transition-colors"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium font-heading truncate">{s.label}</p>
                          {s.description && <p className="text-xs text-neutral-500 truncate">{s.description}</p>}
                        </div>
                        {s.premium && <Badge className="bg-neutral-900 text-white border-0">Premium</Badge>}
                        {s.recommended && !query && <span className="hidden" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-2.5 flex items-center justify-between text-xs text-neutral-500">
          <span>Press <kbd className="rounded border border-neutral-200 bg-white px-1 py-0.5">↵</kbd> to select • <kbd className="rounded border border-neutral-200 bg-white px-1 py-0.5">↑↓</kbd> navigate</span>
          <span className="hidden sm:inline">{results.length} shortcuts</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Global hotkey hook — call from Topbar or layout
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
