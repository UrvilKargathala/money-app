"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { filterShortcuts, SHORTCUTS } from "@/lib/shortcuts";
import { triggerHaptic } from "@/lib/haptics";

export { useCommandPaletteHotkey } from "./command-palette-hotkey";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const router = useRouter();

  const results = useMemo(() => filterShortcuts(query), [query]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

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
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Search className="h-5 w-5 text-neutral-400" />
          <Input
            autoFocus
            placeholder="Search commands - try 'new transaction', 'reports', 'bills'…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(event) => {
              if (!results.length) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const direction = event.key === "ArrowDown" ? 1 : -1;
                setActiveIndex((current) => (current + direction + results.length) % results.length);
              } else if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                setActiveIndex(event.key === "Home" ? 0 : results.length - 1);
              } else if (event.key === "Enter") {
                event.preventDefault();
                const selected = results[activeIndex];
                if (selected) handleSelect(selected.href, selected.action);
              }
            }}
            role="combobox"
            aria-expanded={open}
            aria-controls="command-palette-results"
            aria-activedescendant={results[activeIndex] ? `command-${results[activeIndex].id}` : undefined}
            aria-label="Search commands"
            className="border-0 shadow-none focus-visible:ring-0 h-8 px-0"
          />
        </div>

        <div className="max-h-[380px] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-3">No shortcuts found for “{query}”.</p>
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
                          className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-sunken transition-colors"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-tint-info text-primary-600 dark:bg-[#1E1E1E] dark:text-[#BFDBFE]">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium font-heading text-ink-1">{s.label}</p>
                            {s.description && <p className="text-xs text-ink-3">{s.description}</p>}
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
                <div id="command-palette-results" role="listbox" aria-label="Available commands" className="space-y-1">
                  {results.map((s, index) => {
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.id}
                        id={`command-${s.id}`}
                        ref={(element) => { optionRefs.current[index] = element; }}
                        role="option"
                        aria-selected={index === activeIndex}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => handleSelect(s.href, s.action)}
                        className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${index === activeIndex ? "bg-tint-info ring-1 ring-primary-200 dark:bg-[#1E1E1E]/50 dark:ring-[#60A5FA]" : "hover:bg-sunken"}`}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-wash text-ink-2">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium font-heading truncate">{s.label}</p>
                          {s.description && <p className="text-xs text-ink-3 truncate">{s.description}</p>}
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

        <div className="border-t border-line bg-sunken px-4 py-2.5 flex items-center justify-between text-xs text-ink-3">
          <span>Press <kbd className="rounded border border-line bg-surface px-1 py-0.5">↵</kbd> to select • <kbd className="rounded border border-line bg-surface px-1 py-0.5">↑↓</kbd> navigate • <kbd className="rounded border border-line bg-surface px-1 py-0.5">ESC</kbd> to close</span>
          <span className="hidden sm:inline">{results.length} shortcuts</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Global hotkey hook lives in ./command-palette-hotkey (re-exported above)
// so eager callers don't pull the Dialog chain into their bundle.
