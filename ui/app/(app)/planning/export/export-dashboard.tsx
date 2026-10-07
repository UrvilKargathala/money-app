"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, FileArchive, RefreshCw, Trash2, RotateCcw, Package, Activity, FileSpreadsheet } from "lucide-react";
import { StatCard } from "@/components/common/stat-card";
import { ConfirmDialog, useConfirm } from "@/components/common/confirm-dialog";
import { toast } from "sonner";

type ModuleColumn = { key: string; label: string };
type ModuleInfo = { name: string; label: string; columns?: ModuleColumn[]; description?: string | null };
type Job = {
  id: string;
  status: string;
  export_type?: string | null;
  scope?: string | null;
  module_name?: string | null;
  file_size?: number | null;
  progress?: number | null;
  progress_pct?: number | null;
  created_at?: string;
  updated_at?: string;
  error?: string | null;
};
type StatusInfo = { total_jobs: number; completed: number; failed: number; processing: number; [k: string]: unknown };

function statusVariant(s: string): "success" | "warning" | "error" | "default" | "info" {
  const v = s.toLowerCase();
  if (["completed", "done", "success", "ready"].includes(v)) return "success";
  if (["failed", "error", "cancelled", "canceled"].includes(v)) return "error";
  if (["processing", "running", "queued", "pending"].includes(v)) return "warning";
  if (v === "healthy" || v === "ok") return "success";
  return "default";
}

function formatProgress(j: Job): number {
  if (typeof j.progress_pct === "number") return Math.max(0, Math.min(100, j.progress_pct));
  if (typeof j.progress === "number") return j.progress > 1 ? Math.min(100, j.progress) : Math.round(j.progress * 100);
  const s = (j.status || "").toLowerCase();
  if (s === "completed" || s === "done") return 100;
  if (s === "failed") return 100;
  return 0;
}

export function ExportDashboard({
  modules: initialModules,
  jobs: initialJobs,
  status: initialStatus,
}: {
  modules: ModuleInfo[];
  jobs: Job[];
  status: StatusInfo | null;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [modules] = useState<ModuleInfo[]>(initialModules);
  const [status] = useState<StatusInfo | null>(initialStatus);

  // Backend contract (routes/export.ts): modules are {name,label,columns[]},
  // and POST /jobs reads {export_type, scope, module_name, date_range_start,
  // date_range_end}. PDF generation does not exist server-side (download
  // always rebuilds CSV), so CSV is the only offered format.
  const [format] = useState<string>("csv");
  const [selectedModule, setSelectedModule] = useState<string>(initialModules[0]?.name ?? "");
  const [range, setRange] = useState<string>("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [creating, setCreating] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Sync when server data changes
  useEffect(() => setJobs(initialJobs), [initialJobs]);

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/export/jobs", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const arr: Job[] = Array.isArray(data) ? data : data.jobs ?? data.items ?? [];
      setJobs(arr);
    } catch {}
  }, []);

  // Note: no progress polling here by design. Export jobs are generated
  // synchronously and stored as completed, and downloads regenerate on
  // demand. The list refreshes via refreshJobs() after every user action,
  // which is the only freshness signal needed.

  async function handleCreate() {
    if (!selectedModule) {
      toast.error("Select a module first.");
      return;
    }
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        export_type: format,
        scope: "module",
        module_name: selectedModule,
      };
      if (range === "custom") {
        if (dateFrom) payload.date_range_start = dateFrom;
        if (dateTo) payload.date_range_end = dateTo;
      }
      const res = await fetch("/api/export/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = j.error || (j.fieldErrors ? Object.values(j.fieldErrors).join(" ") : null);
        toast.error(detail || "Could not create export job");
        return;
      }
      toast.success("Export job created");
      await refreshJobs();
      router.refresh();
    } catch {
      toast.error("Could not create export job");
    } finally {
      setCreating(false);
    }
  }

  async function handleFullArchive() {
    setArchiveLoading(true);
    try {
      const res = await fetch("/api/export/full-archive", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error || "Could not create full archive");
        return;
      }
      toast.success("Full archive job created");
      await refreshJobs();
      router.refresh();
    } catch {
      toast.error("Could not create full archive");
    } finally {
      setArchiveLoading(false);
    }
  }

  async function handleRetry(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/export/jobs/${encodeURIComponent(id)}/retry`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error || "Retry failed");
        return;
      }
      toast.success("Job retried");
      await refreshJobs();
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const [confirmState, askConfirm, closeConfirm] = useConfirm();

  function handleDelete(id: string) {
    askConfirm({
      title: "Delete this export job?",
      description: "The record is removed. You can re-run the export any time.",
      onConfirm: async () => {
        setBusyId(id);
        try {
          const res = await fetch(`/api/export/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
          const j = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast.error(j.error || "Delete failed");
            return;
          }
          toast.success("Job deleted");
          setJobs((prev) => prev.filter((x) => x.id !== id));
          router.refresh();
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-ink-1 flex items-center gap-2">
            <Package className="h-7 w-7" /> Data Export
          </h1>
          <p className="text-sm text-ink-3 font-body mt-1">
            {modules.length} exportable modules • {jobs.length} recent jobs • create CSV/PDF jobs and archives
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refreshJobs}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button onClick={handleFullArchive} disabled={archiveLoading}>
            <FileArchive className="h-4 w-4" /> {archiveLoading ? "Creating..." : "Full archive (ZIP)"}
          </Button>
        </div>
      </div>

      {/* Status panel */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5" /> Export Activity
          </CardTitle>
          <CardDescription>Live counts across your export jobs</CardDescription>
        </CardHeader>
        <CardContent>
          {status ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total jobs" value={String(status.total_jobs ?? 0)} icon={<Package className="h-5 w-5" />} variant="primary" />
              <StatCard label="Completed" value={String(status.completed ?? 0)} icon={<Download className="h-5 w-5" />} variant="success" />
              <StatCard label="Failed" value={String(status.failed ?? 0)} icon={<RotateCcw className="h-5 w-5" />} variant="rose" />
              <StatCard label="Processing" value={String(status.processing ?? 0)} icon={<RefreshCw className="h-5 w-5" />} variant="amber" />
            </div>
          ) : (
            <p className="text-sm text-ink-3">Status unavailable right now.</p>
          )}
        </CardContent>
      </Card>

      {/* Modules + create job */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5" /> Exportable Modules
            </CardTitle>
            <CardDescription>Pick a module to see its columns, then create an export job below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {modules.length === 0 ? (
              <p className="text-sm text-ink-3">No modules returned from API. Backend may be pending.</p>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
                {modules.map((m) => (
                  <div
                    key={m.name}
                    className={`rounded-lg border p-3 ${selectedModule === m.name ? "border-primary-600 bg-tint-info/40 dark:border-[#60A5FA] dark:bg-[#1E1E1E]/40" : "border-line"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm font-heading">{m.label ?? m.name}</p>
                      <Badge variant="outline" className="text-[10px]">{m.name}</Badge>
                    </div>
                    {m.description && <p className="text-xs text-ink-3 mt-1">{m.description}</p>}
                    {(m.columns?.length ?? 0) > 0 && <p className="text-xs text-ink-3 mt-1">Columns: {m.columns!.slice(0, 6).map((c) => c.label).join(", ")}{m.columns!.length > 6 ? ` +${m.columns!.length - 6} more` : ""}</p>}
                    <Button
                      variant={selectedModule === m.name ? "default" : "outline"}
                      size="sm"
                      className="mt-2 h-7 text-xs"
                      onClick={() => setSelectedModule((prev) => (prev === m.name ? "" : m.name))}
                    >
                      {selectedModule === m.name ? "Selected" : "Select"}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-line bg-sunken/50 p-4 space-y-3">
              <p className="text-sm font-semibold font-heading">Create export job - POST /api/export/jobs</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Format</Label>
                  <Select value={format} disabled>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">CSV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Module scope</Label>
                  <Select value={selectedModule} onValueChange={setSelectedModule}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select module" />
                    </SelectTrigger>
                    <SelectContent>
                      {modules.map((m) => (
                        <SelectItem key={m.name} value={m.name}>{m.label ?? m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Range</Label>
                  <Select value={range} onValueChange={setRange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All</SelectItem>
                      <SelectItem value="1M">1M</SelectItem>
                      <SelectItem value="3M">3M</SelectItem>
                      <SelectItem value="6M">6M</SelectItem>
                      <SelectItem value="1Y">1Y</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {range === "custom" && (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="date_from">From</Label>
                      <Input id="date_from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="date_to">To</Label>
                      <Input id="date_to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                  </>
                )}
              </div>
              <Button onClick={handleCreate} disabled={creating || !selectedModule} className="w-full sm:w-auto">
                {creating ? "Creating..." : `Create ${format.toUpperCase()} job`}
              </Button>
              <p className="text-xs text-neutral-400">Jobs generate instantly and appear under Recent Exports with a download link.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileArchive className="h-5 w-5" /> Full Archive
            </CardTitle>
            <CardDescription>ZIP with one CSV per module plus a manifest</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-ink-2">One-click full data export. The archive downloads right away and is also tracked below.</p>
            <Button onClick={handleFullArchive} disabled={archiveLoading} className="w-full">
              <FileArchive className="h-4 w-4" /> {archiveLoading ? "Creating archive..." : "Create full archive"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent exports with progress + download */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-5 w-5" /> Recent Exports
          </CardTitle>
          <CardDescription>Every export you create, ready to download</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Package className="h-6 w-6 mx-auto text-neutral-400 mb-2" />
              <p className="text-sm font-medium text-ink-2">No exports yet</p>
              <p className="text-xs text-ink-3 mt-1">Create a job above and it shows up here with its download link.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-ink-3">{jobs.length} jobs • status reflects completed exports • actions: download / retry / delete</p>
              <div className="space-y-3 max-h-[560px] overflow-auto pr-1">
                {jobs.map((j) => {
                  const pct = formatProgress(j);
                  const est = j.file_size ?? null;
                  const s = (j.status || "unknown").toLowerCase();
                  const canDownload = ["completed", "done", "success", "ready"].includes(s);
                  const canRetry = ["failed", "error"].includes(s);
                  return (
                    <div key={j.id} className="rounded-lg border border-line p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold font-heading flex items-center gap-2 flex-wrap">
                            <span className="truncate">{j.module_name ?? j.id.slice(0, 8)}</span>
                            <Badge variant={statusVariant(j.status)} className="shrink-0">{j.status}</Badge>
                            {j.export_type && <Badge variant="outline" className="text-[10px]">{String(j.export_type).toUpperCase()}</Badge>}
                            {j.scope && <Badge variant="outline" className="text-[10px]">{j.scope}</Badge>}
                          </p>
                          <p className="text-xs text-ink-3 mt-1">
                            {j.created_at ? new Date(j.created_at).toLocaleString("en-IN") : ""}{est != null ? ` • ~${Number(est).toLocaleString("en-IN")} bytes` : ""}
                            {j.error ? ` • ${j.error}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {canDownload && (
                            <Button size="sm" asChild>
                              <a href={`/api/export/jobs/${encodeURIComponent(j.id)}/download`} download>
                                <Download className="h-3 w-3" /> Download
                              </a>
                            </Button>
                          )}
                          {canRetry && (
                            <Button variant="outline" size="sm" onClick={() => handleRetry(j.id)} disabled={busyId === j.id}>
                              <RotateCcw className="h-3 w-3" /> {busyId === j.id ? "Retrying..." : "Retry"}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(j.id)} disabled={busyId === j.id} title="Delete job" aria-label="Delete export job">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-ink-3">
                          <span>Progress</span>
                          <span>{Math.round(pct)}%</span>
                        </div>
                        <Progress value={pct} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} />
    </div>
  );
}
