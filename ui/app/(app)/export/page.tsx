import { getExportModules, getExportJobs, getExportStatus } from "@/lib/api-client";
import { ExportDashboard } from "./export-dashboard";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const [modulesRes, jobsRes, statusRes] = await Promise.all([getExportModules(), getExportJobs(), getExportStatus()]);

  // Normalize shapes: jobs may be {jobs}, {items}, or array
  let jobs: unknown[] = [];
  if (Array.isArray(jobsRes)) jobs = jobsRes;
  else if (jobsRes && typeof jobsRes === "object") {
    const o = jobsRes as Record<string, unknown>;
    if (Array.isArray(o.jobs)) jobs = o.jobs as unknown[];
    else if (Array.isArray(o.items)) jobs = o.items as unknown[];
  }

  return (
    <ExportDashboard
      modules={(modulesRes?.modules ?? []) as never}
      jobs={(jobs ?? []) as never}
      status={(statusRes ?? null) as never}
    />
  );
}
