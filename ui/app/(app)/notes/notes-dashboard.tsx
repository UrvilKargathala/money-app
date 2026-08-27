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
import { FileText, Plus, Pin, Trash2, Search, RotateCcw, Tag, LayoutTemplate } from "lucide-react";
import { createNote, updateNote, deleteNoteAction, pinNoteAction, unpinNoteAction, restoreNoteAction, purgeNoteAction } from "./actions";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Note = { id: string; title: string; category: string; is_pinned: number; version: number; created_at: string; deleted_at?: string | null };
type Category = { id: string; name: string };
type Template = { id: string; title: string; category: string; content?: string | null };

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
  const [state, formAction, isPending] = useActionState(editing ? updateNote : createNote, null);

  useEffect(() => {
    if (state?.success) {
      toast.success(editing ? "Note updated" : "Note created");
      setFormOpen(false);
      setEditing(null);
      router.refresh();
    }
    if (state?.error) toast.error(state.error);
  }, [state]);

  const filtered = notes.filter((n) => {
    if (search && !n.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory !== "all" && n.category !== filterCategory) return false;
    return true;
  });

  const filterCategories = Array.from(new Set(notes.map((n) => n.category)));

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
    setFormOpen(true);
  };
  const openEdit = (n: Note) => {
    setEditing(n);
    setCategory(n.category);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-neutral-900">Secure Notes</h1>
          <p className="text-sm text-neutral-500 font-body mt-1">
            {notes.length} notes • {trash.length} in trash • Encrypted vault
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add Note
        </Button>
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
                {categories.map((c) => (
                  <Badge key={c.id} variant="default">
                    {c.name}
                  </Badge>
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
                  <Badge key={t.id} variant="secondary">
                    {t.title}
                  </Badge>
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
                        </p>
                        <Badge variant="default" className="mt-1">
                          {n.category}
                        </Badge>
                      </div>
                      <span className="text-xs text-neutral-400">{new Date(n.created_at).toLocaleDateString("en-IN")}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(n)}>
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
          <form action={formAction} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            {editing && <input type="hidden" name="version" value={String(editing.version)} />}
            <input type="hidden" name="category" value={category} />
            <div className="space-y-2">
              <Label htmlFor="note-title">Title *</Label>
              <Input id="note-title" name="title" defaultValue={editing?.title || ""} placeholder="Bank details, Password" required />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-data">Content *</Label>
              <Textarea id="note-data" name="data" placeholder="Encrypted content" required className="min-h-[100px]" />
              <p className="text-xs text-neutral-400">Content is base64-encoded before sending (stub for vault encryption).</p>
            </div>
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
