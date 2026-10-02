"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/empty-state";
import { FileText, Plus, Pin, Trash2, Search, RotateCcw, Tag, LayoutTemplate, LockKeyhole, ShieldCheck, Paperclip, Download, Eye, Pencil } from "lucide-react";
import { deleteNoteAction, pinNoteAction, unpinNoteAction, restoreNoteAction, purgeNoteAction } from "./actions";
import { useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { createVault, decryptVaultBytes, decryptVaultText, encryptVaultBytes, encryptVaultText, unwrapVaultKey } from "@/lib/vault-crypto";

type Note = { id: string; title: string; category: string; data_encrypted: string; data_iv: string; is_pinned: number; version: number; created_at: string; deleted_at?: string | null };
type Category = { name: string; count?: number; seeded?: boolean };
type Template = { id: string; title: string; category: string; content?: string | null };
type Attachment = { id: string; file_name: string; file_type?: string | null; file_size?: number };

export function NotesDashboard({
  notes,
  trash,
  categories,
  templates,
}: {
  notes: Note[];
  trash: Note[];
  categories: Category[];
  templates: Template[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [category, setCategory] = useState("other");
  const [noteTitle, setNoteTitle] = useState("");
  const [content, setContent] = useState("");
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [vaultReady, setVaultReady] = useState(false);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [legacyIds, setLegacyIds] = useState<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);

  useEffect(() => {
    fetch("/api/vault/wrapped-key", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const body = await res.json();
        setVaultReady(Boolean(body.initialized));
      })
      .catch(() => toast.error("Could not load the secure vault."));
  }, []);

  const unlockVault = async () => {
    if (!password) return;
    setUnlocking(true);
    try {
      const verify = await fetch("/api/vault/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
      const verifyBody = await verify.json().catch(() => ({}));
      if (!verify.ok) throw new Error(verifyBody.error || "Incorrect password.");
      const infoRes = await fetch("/api/vault/wrapped-key", { cache: "no-store" });
      const info = await infoRes.json();
      if (info.initialized) {
        const key = await unwrapVaultKey(password, info.vault_wrapped, info.kdf.salt, info.kdf.iterations);
        setVaultKey(key);
      } else {
        const created = await createVault(password);
        const save = await fetch("/api/vault/rewrap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wrapped: created.wrapped, kdf_salt: created.salt, kdf_iters: created.iterations }) });
        if (!save.ok) throw new Error("Could not initialize the vault.");
        setVaultKey(created.vaultKey);
        setVaultReady(true);
      }
      setPassword("");
      toast.success(info.initialized ? "Vault unlocked" : "Secure vault created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not unlock the vault.");
    } finally {
      setUnlocking(false);
    }
  };

  const lockVault = () => {
    setVaultKey(null);
    setContent("");
    setEditing(null);
    setFormOpen(false);
    void fetch("/api/vault/lock", { method: "POST" });
    toast.success("Vault locked");
  };

  const filtered = notes.filter((n) => {
    if (search && !n.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory !== "all" && n.category !== filterCategory) return false;
    return true;
  });

  const filterCategories = Array.from(
    new Set(notes.map((n) => n.category).filter(Boolean))
  );

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    const res = await deleteNoteAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Moved to trash");
      router.refresh();
    }
  };
  const handlePin = async (n: Note) => {
    const res = n.is_pinned ? await unpinNoteAction(n.id) : await pinNoteAction(n.id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success(n.is_pinned ? "Unpinned" : "Pinned");
      router.refresh();
    }
  };
  const handleRestore = async (id: string) => {
    const res = await restoreNoteAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Restored");
      router.refresh();
    }
  };
  const handlePurge = async (id: string) => {
    if (!confirm("Permanently delete?")) return;
    const res = await purgeNoteAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Purged");
      router.refresh();
    }
  };

  const openCreate = () => {
    setEditing(null);
    setCategory("other");
    setContent("");
    setNoteTitle("");
    setAttachments([]);
    setFormOpen(true);
  };
  const applyTemplate = (template: Template) => {
    setEditing(null);
    setNoteTitle(template.title);
    setCategory(template.category || "other");
    setContent(template.content || "");
    setAttachments([]);
    setFormOpen(true);
  };
  const openEdit = async (n: Note) => {
    if (!vaultKey) return;
    try {
      const decrypted = await decryptVaultText(vaultKey, n.data_encrypted, n.data_iv);
      setContent(decrypted.content);
      if (decrypted.legacy) setLegacyIds((current) => new Set(current).add(n.id));
    } catch {
      toast.error("This note could not be decrypted with the current vault key.");
      return;
    }
    setEditing(n);
    setNoteTitle(n.title);
    setCategory(n.category);
    fetch(`/api/notes/${n.id}/attachments`).then(r=>r.ok?r.json():null).then(d=>setAttachments(d?.attachments??[])).catch(()=>setAttachments([]));
    setFormOpen(true);
  };

  async function uploadAttachment(file: File) {
    if (!editing || !vaultKey) return;
    if (file.size > 4.9 * 1024 * 1024) return toast.error("Choose a file smaller than 4.9MB.");
    setAttachmentBusy(true);
    try {
      const encrypted = await encryptVaultBytes(vaultKey, new Uint8Array(await file.arrayBuffer()));
      const qs = new URLSearchParams({ name: file.name, type: file.type || "application/octet-stream" });
      const res = await fetch(`/api/notes/${editing.id}/attachments?${qs}`, { method: "POST", headers: { "content-type": "application/octet-stream" }, body: encrypted });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not upload attachment.");
      const list = await fetch(`/api/notes/${editing.id}/attachments`).then(r => r.json());
      setAttachments(list.attachments ?? []);
      toast.success("Encrypted attachment added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload attachment.");
    } finally {
      setAttachmentBusy(false);
    }
  }

  async function openAttachment(item: Attachment, preview: boolean) {
    if (!editing || !vaultKey) return;
    try {
      const res = await fetch(`/api/notes/${editing.id}/attachments/${item.id}`);
      if (!res.ok) throw new Error();
      const clear = await decryptVaultBytes(vaultKey, new Uint8Array(await res.arrayBuffer()));
      const url = URL.createObjectURL(new Blob([clear], { type: item.file_type || "application/octet-stream" }));
      if (preview) window.open(url, "_blank", "noopener,noreferrer");
      else { const anchor = document.createElement("a"); anchor.href = url; anchor.download = item.file_name; anchor.click(); }
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch { toast.error("Could not decrypt this attachment."); }
  }

  async function removeAttachment(item: Attachment) {
    if (!editing || !confirm(`Delete ${item.file_name}?`)) return;
    const res = await fetch(`/api/notes/${editing.id}/attachments/${item.id}`, { method: "DELETE" });
    if (res.ok) { setAttachments(current => current.filter(value => value.id !== item.id)); toast.success("Attachment removed."); }
    else toast.error("Could not remove attachment.");
  }

  async function renameCategory(from: string) {
    const to = prompt("Rename category", from)?.trim();
    if (!to || to === from) return;
    const res = await fetch("/api/notes/categories", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ from_category: from, to_category: to }) });
    if (res.ok) { toast.success("Category renamed."); router.refresh(); }
    else toast.error("Could not rename category.");
  }

  const saveNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!vaultKey) return;
    setIsPending(true);
    try {
      const encrypted = await encryptVaultText(vaultKey, content);
      const payload = {
        title: noteTitle.trim(),
        category,
        ...encrypted,
        ...(editing ? { version: editing.version } : {}),
      };
      const res = await fetch(editing ? `/api/notes/${editing.id}` : "/api/notes", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || Object.values(body.fieldErrors || {})[0] || "Could not save the note.");
      if (editing) setLegacyIds((current) => { const next = new Set(current); next.delete(editing.id); return next; });
      toast.success(editing ? "Note encrypted and updated" : "Note encrypted and created");
      setFormOpen(false);
      setEditing(null);
      setContent("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the note.");
    } finally {
      setIsPending(false);
    }
  };

  if (!vaultKey) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card className="overflow-hidden border-primary-100">
          <div className="bg-gradient-to-br from-primary-600 to-indigo-700 px-6 py-8 text-white">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15"><LockKeyhole className="h-6 w-6" /></div>
            <h1 className="text-2xl font-bold font-heading">{vaultReady ? "Unlock Secure Notes" : "Create your secure vault"}</h1>
            <p className="mt-2 text-sm text-white/75">Your password unlocks an encryption key in this browser. Plain note content is never sent to the server.</p>
          </div>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-2"><Label htmlFor="vault-password">Account password</Label><Input id="vault-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void unlockVault(); }} /></div>
            <Button className="w-full" onClick={() => void unlockVault()} disabled={unlocking || !password}>{unlocking ? "Unlocking..." : vaultReady ? "Unlock vault" : "Create encrypted vault"}</Button>
            <p className="flex items-start gap-2 text-xs text-neutral-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-dark" /> Uses PBKDF2 and AES-256-GCM through your browser&apos;s Web Crypto API.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-neutral-900">Secure Notes</h1>
          <p className="text-sm text-neutral-500 font-body mt-1">
            {notes.length} notes • {trash.length} in trash • Encrypted vault
          </p>
        </div>
        <div className="flex gap-2"><Button variant="outline" onClick={lockVault}><LockKeyhole className="h-4 w-4" /> Lock</Button><Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Note</Button></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4" /> Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <p className="text-sm text-neutral-400">No categories</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {categories
                  .filter((c) => Boolean(c.name))
                  .map((c) => (
                    <button key={c.name} onClick={() => void renameCategory(c.name)} className="group">
                      <Badge variant="default">{c.name}<Pencil className="ml-1 inline h-3 w-3 opacity-0 group-hover:opacity-100" /></Badge>
                    </button>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <LayoutTemplate className="h-4 w-4" /> Templates
            </CardTitle>
          </CardHeader>
          <CardContent>
            {templates.length === 0 ? (
              <p className="text-sm text-neutral-400">No templates</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button key={t.id} onClick={() => applyTemplate(t)}><Badge variant="secondary">{t.title} · Use template</Badge></button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="notes">
        <TabsList>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
          <TabsTrigger value="trash">Trash ({trash.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="space-y-4">
          <Card className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input placeholder="Search notes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {filterCategories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="No notes"
              description="Create a secure note for passwords, IDs, or any sensitive data."
              actionLabel="Add Note"
              onAction={openCreate}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered
                .sort((a, b) => b.is_pinned - a.is_pinned)
                .map((n) => (
                  <Card key={n.id} className={`p-4 space-y-3 ${n.is_pinned ? "border-primary-200 bg-primary-50/50" : ""}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold font-heading text-neutral-900 flex items-center gap-2">
                          {n.is_pinned ? <Pin className="h-3 w-3 text-primary-600" /> : null}
                          {n.title}
                          {legacyIds.has(n.id) ? <Badge variant="warning">Needs encryption upgrade</Badge> : null}
                        </p>
                        <Badge variant="default" className="mt-1">
                          {n.category}
                        </Badge>
                      </div>
                      <span className="text-xs text-neutral-400">{new Date(n.created_at).toLocaleDateString("en-IN")}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => void openEdit(n)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handlePin(n)}>
                        <Pin className="h-4 w-4" /> {n.is_pinned ? "Unpin" : "Pin"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(n.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="trash" className="space-y-4">
          {trash.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-neutral-500">Trash is empty</p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {trash.map((n) => (
                <Card key={n.id} className="p-4 space-y-3 bg-neutral-50">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold font-heading text-neutral-900">{n.title}</p>
                      <Badge variant="default" className="mt-1">
                        {n.category}
                      </Badge>
                    </div>
                    <span className="text-xs text-neutral-400">{new Date(n.created_at).toLocaleDateString("en-IN")}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleRestore(n.id)}>
                      <RotateCcw className="h-4 w-4" /> Restore
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handlePurge(n.id)}>
                      <Trash2 className="h-4 w-4" /> Purge
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit note" : "Add note"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveNote} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="note-title">Title *</Label>
              <Input id="note-title" name="title" value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Bank details, Password" required />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set(["personal", "financial", "document", "other", ...categories.map(c => c.name), ...templates.map(t => t.category)])).filter(Boolean).map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-data">Content *</Label>
              <Textarea id="note-data" name="data" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Encrypted content" required className="min-h-[140px]" />
              <p className="text-xs text-neutral-400">Encrypted in this browser with AES-256-GCM before it is sent.</p>
            </div>
            {editing && <div className="space-y-2">
              <Label className="flex items-center gap-2"><Paperclip className="h-4 w-4" />Attachments</Label>
              <Input type="file" disabled={attachmentBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); event.target.value = ""; }} />
              <div className="space-y-2">{attachments.map(item => <div key={item.id} className="flex items-center justify-between rounded-lg border p-2 text-sm"><span className="truncate">{item.file_name}</span><div className="flex gap-1"><Button type="button" size="sm" variant="ghost" onClick={() => void openAttachment(item, true)}><Eye className="h-4 w-4" /><span className="sr-only">Preview</span></Button><Button type="button" size="sm" variant="ghost" onClick={() => void openAttachment(item, false)}><Download className="h-4 w-4" /><span className="sr-only">Download</span></Button><Button type="button" size="sm" variant="ghost" onClick={() => void removeAttachment(item)}><Trash2 className="h-4 w-4" /><span className="sr-only">Delete</span></Button></div></div>)}</div>
              <p className="text-xs text-neutral-400">Files are encrypted in this browser. Save a new note first, then edit it to add attachments.</p>
            </div>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
