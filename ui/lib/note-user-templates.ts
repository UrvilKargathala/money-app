// Client-safe user-template API (plain fetch). Must NOT import
// "@/lib/api-client" - that module is server-only (next/headers, API app)
// and breaks the browser bundle (see notes-dashboard import error).

export type NoteUserTemplate = {
  id: string;
  title: string;
  category: string;
  content: string;
  version: number;
};

async function callNotesTemplates(
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, body };
}

export async function createNoteUserTemplate(payload: {
  title: string;
  category: string;
  content: string;
}): Promise<{ success: boolean; template: { id: string } } | null> {
  try {
    const { ok, body } = await callNotesTemplates("/api/notes/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (!ok) return null;
    return body as { success: boolean; template: { id: string } };
  } catch {
    return null;
  }
}

export async function updateNoteUserTemplate(
  id: string,
  payload: { title?: string; category?: string; content?: string; version: number }
): Promise<boolean> {
  try {
    const { ok } = await callNotesTemplates(`/api/notes/templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return ok;
  } catch {
    return false;
  }
}

export async function deleteNoteUserTemplate(id: string): Promise<boolean> {
  try {
    const { ok } = await callNotesTemplates(`/api/notes/templates/${id}`, { method: "DELETE" });
    return ok;
  } catch {
    return false;
  }
}
