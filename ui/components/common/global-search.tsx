"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Wallet, Receipt, FileText, ArrowLeftRight, Repeat, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Result = { id: string; title: string; subtitle: string | null; kind: string; href: string };
const icons = { transaction: ArrowLeftRight, note: FileText, account: Wallet, bill: Receipt, subscription: Repeat };

export function GlobalSearch({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setLoading(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal, cache: "no-store" });
        const body = await res.json();
        if (res.ok) setResults(body.results ?? []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setResults([]);
      } finally { setLoading(false); }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const navigate = (result: Result) => {
    setOpen(false); setQuery(""); onNavigate?.();
    router.push(`${result.href}?highlight=${encodeURIComponent(result.id)}`);
  };

  return (
    <div ref={rootRef} className={cn("relative", mobile ? "w-full" : "w-[240px]")}> 
      <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search transactions, notes, bills..." className={cn("h-10 w-full rounded-full border border-neutral-200 bg-neutral-50 pl-9 pr-9 text-sm placeholder:text-neutral-400 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100", !mobile && "h-9")} />
      {loading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-neutral-400" /> : null}
      {open && query.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border bg-white p-2 shadow-xl sm:min-w-[360px]">
          {!loading && results.length === 0 ? <p className="px-3 py-6 text-center text-sm text-neutral-500">No matching records</p> : null}
          {results.map((result) => {
            const Icon = icons[result.kind as keyof typeof icons] ?? Search;
            return <button key={`${result.kind}-${result.id}`} type="button" onClick={() => navigate(result)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-neutral-50"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-neutral-900">{result.title}</span><span className="block truncate text-xs capitalize text-neutral-500">{result.subtitle || result.kind}</span></span></button>;
          })}
        </div>
      ) : null}
    </div>
  );
}
