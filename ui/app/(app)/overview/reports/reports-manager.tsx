"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, FileBarChart, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/empty-state";
import { trackFeature } from "@/lib/analytics";

type Template = { id: string; user_id: number | null; name: string; description: string | null; chart_config: unknown; version?: number };
type ExportJob = { id: string; file_type: string; status: string; created_at: string; date_range_start?: string | null; date_range_end?: string | null };

export function ReportsManager({ templates, exports: jobs, initialFilters = [] }: { templates: Template[]; exports: ExportJob[]; initialFilters?: { name: string; start: string; end: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [savedFilters, setSavedFilters] = useState<{ name: string; start: string; end: string }[]>(initialFilters);

  // Name dialog backing both prompt() replacements: saving a filter and
  // renaming a template. target === null means filter-save mode.
  const [nameOpen, setNameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameTarget, setNameTarget] = useState<Template | null>(null);

  function saveFilter() {
    if (!start && !end) return setMessage("Choose a date range before saving a filter.");
    setNameTarget(null);
    setNameDraft(`${start || "Any"} to ${end || "Any"}`);
    setNameOpen(true);
  }

  async function submitName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = nameDraft.trim();
    if (!name) return;
    if (nameTarget === null) {
      const next = [...savedFilters.filter((item) => item.name !== name), { name, start, end }];
      setSavedFilters(next);
      void fetch("/api/users/me/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ report_filters: next }) });
      setMessage("Filter saved.");
    } else {
      if (name === nameTarget.name) { setNameOpen(false); return; }
      await mutate(`/api/report-templates/${nameTarget.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, version: nameTarget.version ?? 1 }) });
    }
    setNameOpen(false);
  }

  async function mutate(path: string, init: RequestInit) {
    setBusy(true); setMessage("");
    const res = await fetch(path, init);
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMessage(body.error ?? "Something went wrong."); return false; }
    router.refresh(); return true;
  }

  async function createTemplate() {
    if (!name.trim()) return setMessage("Enter a template name.");
    const ok = await mutate("/api/report-templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description, chart_config: { sections: ["summary", "cashflow", "categories", "net-worth"] } }) });
    if (ok) { trackFeature("report_template_created"); setName(""); setDescription(""); setMessage("Template saved."); }
  }

  async function generate() {
    const ok = await mutate("/api/reports/export-pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ template_id: templateId || null, start_date: start || null, end_date: end || null }) });
    if (ok) { trackFeature("report_generated", { template: templateId || "standard" }); setMessage("Report generated and added to history."); }
  }

  function renameTemplate(template: Template) {
    setNameTarget(template);
    setNameDraft(template.name);
    setNameOpen(true);
  }

  return <div className="grid gap-6 xl:grid-cols-2">
    <Card><CardHeader className="pb-4"><CardTitle>Saved report templates</CardTitle><CardDescription>Save a reusable report setup for future exports.</CardDescription></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><Input value={name} onChange={e=>setName(e.target.value)} placeholder="Template name" /><Input value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description (optional)" /></div>
      <Button onClick={createTemplate} disabled={busy}><Plus className="mr-2 h-4 w-4"/>Save template</Button>
      <div className="divide-y rounded-xl border">
        {templates.length === 0 && <EmptyState title="No templates yet" description="Save the form above to reuse this report setup." />}
        {templates.map(t=><div key={t.id} className="flex items-center justify-between gap-3 p-4"><div><p className="font-medium">{t.name}</p><p className="text-xs text-ink-3">{t.description || (t.user_id === null ? "MoneyMind template" : "Your template")}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>mutate(`/api/report-templates/${t.id}/duplicate`,{method:"POST"})}><Copy className="h-4 w-4"/><span className="sr-only">Duplicate</span></Button>{t.user_id !== null && <><Button size="sm" variant="outline" onClick={()=>renameTemplate(t)}><Pencil className="h-4 w-4"/><span className="sr-only">Rename</span></Button><Button size="sm" variant="outline" onClick={()=>mutate(`/api/report-templates/${t.id}`,{method:"DELETE"})}><Trash2 className="h-4 w-4"/><span className="sr-only">Delete</span></Button></>}</div></div>)}
      </div>
    </CardContent></Card>
    <Card><CardHeader className="pb-4"><CardTitle>Generate and download</CardTitle><CardDescription>Create a PDF and keep it in your report history.</CardDescription></CardHeader><CardContent className="space-y-4">
      <select aria-label="Report template" className="h-10 w-full rounded-md border bg-surface px-3 text-sm" value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Standard report</option>{templates.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select>
      <div className="grid gap-3 sm:grid-cols-2"><Input type="date" aria-label="Report start date" value={start} onChange={e=>setStart(e.target.value)} /><Input type="date" aria-label="Report end date" value={end} onChange={e=>setEnd(e.target.value)} /></div>
      <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={saveFilter}>Save filter</Button>{savedFilters.map((item) => <Button key={item.name} type="button" variant="ghost" size="sm" onClick={() => { setStart(item.start); setEnd(item.end); }}>{item.name}</Button>)}</div>
      <Button onClick={generate} disabled={busy}><FileBarChart className="mr-2 h-4 w-4"/>Generate PDF</Button>
      {message && <p role="status" className="text-sm text-ink-2">{message}</p>}
      <div className="divide-y rounded-xl border">{jobs.length === 0 && <p className="p-4 text-sm text-ink-3">Generated reports will appear here.</p>}{jobs.map(j=><div key={j.id} className="flex items-center justify-between p-4"><div><p className="text-sm font-medium">PDF report</p><p className="text-xs text-ink-3">{new Date(j.created_at).toLocaleString()} · {j.status}</p></div><Button asChild size="sm" variant="outline"><a href={`/api/report-exports/${j.id}/download`}><Download className="mr-2 h-4 w-4"/>Download</a></Button></div>)}</div>
    </CardContent></Card>
    <Dialog open={nameOpen} onOpenChange={setNameOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{nameTarget === null ? "Name this report filter" : "Rename template"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submitName} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="report-name">Name</Label>
            <Input id="report-name" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} placeholder="Name" required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNameOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
