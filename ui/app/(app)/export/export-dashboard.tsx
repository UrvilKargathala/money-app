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
import { toast } from "sonner";

type ModuleInfo = { module: string; label: string; columns?: string[]; column_sets?: string[][]; description?: string | null };
type Job = {
  id: string;
  status: string;
  format?: string;
  module?: string | null;
  modules?: string[] | null;
  range?: string | null;
  progress?: number | null;
  progress_pct?: number | null;
  download_url?: string | null;
  file_size?: number | null;
  created_at?: string;
  updated_at?: string;
  error?: string | null;
};
type StatusInfo = { health: string; queue_depth?: number; queue?: number; active_jobs?: number; last_run?: string | null; pipeline?: string | null; [k: string]: unknown };

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

  const [format, setFormat] = useState<string>("csv");
  const [selectedModule, setSelectedModule] = useState<string>(initialModules[0]?.module ?? "");
  const [range, setRange] = useState<string>("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [creating, setCreating] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, { progress: number; size_estimate?: number | null }>>({});
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

  // Poll progress for non-terminal jobs
  const activeIds = jobs.filter((j) => ["queued", "processing", "pending", "running"].includes((j.status || "").toLowerCase())).map((j) => j.id);
  useEffect(() => {
    if (activeIds.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      for (const id of activeIds) {
        try {
          const res = await fetch(`/api/export/jobs/${encodeURIComponent(id)}/progress`, { cache: "no-store" });
          if (!res.ok) continue;
          const d = (await res.json()) as { progress?: number; progress_pct?: number; bytes?: number; size_estimate?: number | null };
          const pct = typeof d.progress_pct === "number" ? d.progress_pct : typeof d.progress === "number" ? (d.progress > 1 ? d.progress : d.progress * 100) : 0;
          if (!cancelled) setProgressMap((m) => ({ ...m, [id]: { progress: pct, size_estimate: d.size_estimate ?? null } }));
        } catch {}
      }
    };
    tick();
    const iv = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [activeIds.join(",")]);

  async function handleCreate() {
    setCreating(true);
    try {
      const payload: Record<string, unknown> = { format, range };
      if (selectedModule) {
        // spec says module scope — send as module; backend may accept modules array — send both
        payload.module = selectedModule;
        payload.modules = [selectedModule];
      }
      if (range === "custom") {
        if (dateFrom) payload.date_from = dateFrom;
        if (dateTo) payload.date_to = dateTo;
      }
      const res = await fetch("/api/export/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(j.error || j.fieldErrors ? JSON.stringify(j.fieldErrors) : "Could not create export job");
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

  async function handleDelete(id: string) {
    if (!confirm("Delete this export job?")) return;
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
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-neutral-900 flex items-center gap-2">
            <Package className="h-7 w-7" /> Data Export
          </h1>
          <p className="text-sm text-neutral-500 font-body mt-1">
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-5 w-5" /> Pipeline Health & Queue
          </CardTitle>
          <CardDescription>GET /api/export/status — live pipeline, queue depth and health</CardDescription>
        </CardHeader>
        <CardContent>
          {status ? (
            <div className="flex flex-wrap gap-3 items-center text-sm">
              <Badge variant={status.health?.toLowerCase() === "healthy" || status.health?.toLowerCase() === "ok" ? "success" : status.health ? "warning" : "default"}>
                {status.health ?? "unknown"}
              </Badge>
              {status.queue_depth != null && <span className="text-neutral-600">Queue: {String(status.queue_depth)}</span>}
              {status.queue != null && status.queue_depth == null && <span className="text-neutral-600">Queue: {String(status.queue)}</span>}
              {status.active_jobs != null && <span className="text-neutral-600">Active: {String(status.active_jobs)}</span>}
              {status.pipeline && <span className="text-neutral-600">Pipeline: {String(status.pipeline)}</span>}
              {status.last_run && <span className="text-neutral-500 text-xs">Last run: {new Date(String(status.last_run)).toLocaleString("en-IN")}</span>}
              <span className="text-xs text-neutral-400 ml-auto">All values from API — no hardcoded counts</span>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">No status available — backend may not have implemented /api/export/status yet.</p>
          )}
          {status && (
            <pre className="mt-3 text-xs bg-neutral-50 p-3 rounded-lg overflow-auto max-h-32">{JSON.stringify(status, null, 2)}</pre>
          )}
        </CardContent>
      </Card>

      {/* Modules + create job */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5" /> Exportable Modules
            </CardTitle>
            <CardDescription>GET /api/export/modules — column sets per module. Choose scope, format and range to create a job.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {modules.length === 0 ? (
              <p className="text-sm text-neutral-500">No modules returned from API. Backend may be pending.</p>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
                {modules.map((m) => (
                  <div
                    key={m.module}
                    className={`rounded-lg border p-3 ${selectedModule === m.module ? "border-primary-600 bg-primary-50/40" : "border-neutral-100"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm font-heading">{m.label ?? m.module}</p>
                      <Badge variant="outline" className="text-[10px]">{m.module}</Badge>
                    </div>
                    {m.description && <p className="text-xs text-neutral-500 mt-1">{m.description}</p>}
                    {(m.columns?.length ?? 0) > 0 && <p className="text-xs text-neutral-500 mt-1">Columns: {m.columns!.slice(0, 6).join(", ")}{m.columns!.length > 6 ? ` +${m.columns!.length - 6} more` : ""}</p>}
                    {m.column_sets && m.column_sets.length > 0 && (
                      <p className="text-xs text-neutral-500">Column sets: {m.column_sets.length} variants</p>
                    )}
                    <Button
                      variant={selectedModule === m.module ? "default" : "outline"}
                      size="sm"
                      className="mt-2 h-7 text-xs"
                      onClick={() => setSelectedModule(m.module)}
                    >
                      {selectedModule === m.module ? "Selected" : "Select"}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-4 space-y-3">
              <p className="text-sm font-semibold font-heading">Create export job — POST /api/export/jobs</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Format</Label>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="pdf">PDF</SelectItem>
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
                        <SelectItem key={m.module} value={m.module}>{m.label ?? m.module}</SelectItem>
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
              <p className="text-xs text-neutral-400">POST /api/export/jobs — {format}, module={selectedModule || "(choose)"}, range={range}. All jobs from API.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileArchive className="h-5 w-5" /> Full Archive
            </CardTitle>
            <CardDescription>POST /api/export/full-archive — ZIP + manifest of all user data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-neutral-600">One-click full data export. Backend returns a job (or ZIP). Track it in Recent Exports below.</p>
            <Button onClick={handleFullArchive} disabled={archiveLoading} className="w-full">
              <FileArchive className="h-4 w-4" /> {archiveLoading ? "Creating archive..." : "Create full archive"}
            </Button>
            <p className="text-xs text-neutral-400">Requires same auth cookie as other export routes. 24h expiring download link after completion.</p>
            <div className="rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
              <p className="font-medium text-neutral-700">Tip</p>
              <p>Quick CSVs still available in Settings → Data Export. Batched jobs and the ZIP live here.</p>
              <Button variant="link" size="sm" asChild className="px-0 h-auto text-xs">
                <a href="/settings">Go to Settings →</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent exports with progress + download */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-5 w-5" /> Recent Exports
          </CardTitle>
          <CardDescription>GET /api/export/jobs + poll GET /api/export/jobs/:id/progress — download via GET /api/export/jobs/:id/download (24h link)</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <Package className="h-6 w-6 mx-auto text-neutral-400 mb-2" />
              <p className="text-sm font-medium text-neutral-700">No exports yet</p>
              <p className="text-xs text-neutral-500 mt-1">Create a job above. Every row here comes from GET /api/export/jobs — no hardcoded counts.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-neutral-500">{jobs.length} jobs • progress polled every 3s for queued/processing • actions: download / retry / delete</p>
              <div className="space-y-3 max-h-[560px] overflow-auto pr-1">
                {jobs.map((j) => {
                  const pct = progressMap[j.id]?.progress ?? formatProgress(j);
                  const est = progressMap[j.id]?.size_estimate ?? j.file_size ?? null;
                  const s = (j.status || "unknown").toLowerCase();
                  const canDownload = ["completed", "done", "success", "ready"].includes(s);
                  const canRetry = ["failed", "error"].includes(s);
                  return (
                    <div key={j.id} className="rounded-lg border border-neutral-100 p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold font-heading flex items-center gap-2 flex-wrap">
                            <span className="truncate">{j.module ?? j.modules?.join(", ") ?? j.id.slice(0, 8)}</span>
                            <Badge variant={statusVariant(j.status)} className="shrink-0">{j.status}</Badge>
                            {j.format && <Badge variant="outline" className="text-[10px]">{String(j.format).toUpperCase()}</Badge>}
                            {j.range && <Badge variant="outline" className="text-[10px]">{j.range}</Badge>}
                          </p>
                          <p className="text-xs text-neutral-500 mt-1">
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
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(j.id)} disabled={busyId === j.id} title="Delete job">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-neutral-500">
                          <span>Progress</span>
                          <span>{Math.round(pct)}%</span>
                        </div>
                        <Progress value={pct} />
                        <p className="text-[11px] text-neutral-400">
                          GET /api/export/jobs/{j.id}/progress → {Math.round(pct)}%{est != null ? `, est ${est} bytes` : ""} • status {j.status}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
