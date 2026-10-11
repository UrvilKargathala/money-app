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
import { PageHeader } from "@/components/common/page-header";
import dynamic from "next/dynamic";
import { useConfirm } from "@/components/common/confirm-dialog";

// ConfirmDialog mounts only when opened (ssr:false code-split).
const ConfirmDialog = dynamic(
  () => import("@/components/common/confirm-dialog").then((m) => m.ConfirmDialog),
  { ssr: false }
);
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

function statusVariant(status: string): "success" | "warning" | "error" | "default" | "info" {
  const normalized = status.toLowerCase();
  if (["completed", "done", "success", "ready"].includes(normalized)) return "success";
  if (["failed", "error", "cancelled", "canceled"].includes(normalized)) return "error";
  if (["processing", "running", "queued", "pending"].includes(normalized)) return "warning";
  if (normalized === "healthy" || normalized === "ok") return "success";
  return "default";
}

function formatProgress(job: Job): number {
  if (typeof job.progress_pct === "number") return Math.max(0, Math.min(100, job.progress_pct));
  if (typeof job.progress === "number") return job.progress > 1 ? Math.min(100, job.progress) : Math.round(job.progress * 100);
  const normalized = (job.status || "").toLowerCase();
  if (normalized === "completed" || normalized === "done") return 100;
  if (normalized === "failed") return 100;
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
  const format = "csv";
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
          setJobs((prev) => prev.filter((job) => job.id !== id));
          router.refresh();
        } finally {
          setBusyId(null);
        }
      },
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="flex items-center gap-2"><Package className="h-7 w-7" /> Data Export</span>}
        description={
          <>
            {modules.length} exportable modules • {jobs.length} recent jobs • create CSV/PDF jobs and archives
          </>
        }
        actionsClassName="flex items-center gap-2"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={refreshJobs}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button onClick={handleFullArchive} disabled={archiveLoading}>
              <FileArchive className="h-4 w-4" /> {archiveLoading ? "Creating..." : "Full archive (ZIP)"}
            </Button>
          </>
        }
      />

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
            <p className="text-sm text-faint">Status unavailable right now.</p>
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
              <p className="text-sm text-faint">No modules returned from API. Backend may be pending.</p>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
                {modules.map((module) => (
                  <div
                    key={module.name}
                    className={`rounded-lg border p-3 ${selectedModule === module.name ? "border-primary-600 bg-info-soft/40 dark:border-[#60A5FA] dark:bg-[#1E1E1E]/40" : "border-edge"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm font-heading">{module.label ?? module.name}</p>
                      <Badge variant="outline" className="text-[10px]">{module.name}</Badge>
                    </div>
                    {module.description && <p className="text-xs text-faint mt-1">{module.description}</p>}
                    {(module.columns?.length ?? 0) > 0 && <p className="text-xs text-faint mt-1">Columns: {module.columns!.slice(0, 6).map((col) => col.label).join(", ")}{module.columns!.length > 6 ? ` +${module.columns!.length - 6} more` : ""}</p>}
                    <Button
                      variant={selectedModule === module.name ? "default" : "outline"}
                      size="sm"
                      className="mt-2 h-7 text-xs"
                      onClick={() => setSelectedModule((prev) => (prev === module.name ? "" : module.name))}
                    >
                      {selectedModule === module.name ? "Selected" : "Select"}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-edge bg-deep/50 p-4 space-y-3">
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
                      {modules.map((module) => (
                        <SelectItem key={module.name} value={module.name}>{module.label ?? module.name}</SelectItem>
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
              <p className="text-xs text-faint">Jobs generate instantly and appear under Recent Exports with a download link.</p>
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
            <p className="text-sm text-muted-foreground">One-click full data export. The archive downloads right away and is also tracked below.</p>
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
              <Package className="h-6 w-6 mx-auto text-faint mb-2" />
              <p className="text-sm font-medium text-muted-foreground">No exports yet</p>
              <p className="text-xs text-faint mt-1">Create a job above and it shows up here with its download link.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-faint">{jobs.length} jobs • status reflects completed exports • actions: download / retry / delete</p>
              <div className="space-y-3 max-h-[560px] overflow-auto pr-1">
                {jobs.map((job) => {
                  const pct = formatProgress(job);
                  const est = job.file_size ?? null;
                  const normalized = (job.status || "unknown").toLowerCase();
                  const canDownload = ["completed", "done", "success", "ready"].includes(normalized);
                  const canRetry = ["failed", "error"].includes(normalized);
                  return (
                    <div key={job.id} className="rounded-lg border border-edge p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold font-heading flex items-center gap-2 flex-wrap">
                            <span className="truncate">{job.module_name ?? job.id.slice(0, 8)}</span>
                            <Badge variant={statusVariant(job.status)} className="shrink-0">{job.status}</Badge>
                            {job.export_type && <Badge variant="outline" className="text-[10px]">{String(job.export_type).toUpperCase()}</Badge>}
                            {job.scope && <Badge variant="outline" className="text-[10px]">{job.scope}</Badge>}
                          </p>
                          <p className="text-xs text-faint mt-1">
                            {job.created_at ? new Date(job.created_at).toLocaleString("en-IN") : ""}{est != null ? ` • ~${Number(est).toLocaleString("en-IN")} bytes` : ""}
                            {job.error ? ` • ${job.error}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {canDownload && (
                            <Button size="sm" asChild>
                              <a href={`/api/export/jobs/${encodeURIComponent(job.id)}/download`} download>
                                <Download className="h-3 w-3" /> Download
                              </a>
                            </Button>
                          )}
                          {canRetry && (
                            <Button variant="outline" size="sm" onClick={() => handleRetry(job.id)} disabled={busyId === job.id}>
                              <RotateCcw className="h-3 w-3" /> {busyId === job.id ? "Retrying..." : "Retry"}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(job.id)} disabled={busyId === job.id} title="Delete job" aria-label="Delete export job">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-faint">
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
      {confirmState ? <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} /> : null}
    </div>
  );
}
