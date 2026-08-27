import { getNotesData, getNotesTrash, getNoteCategories, getNoteTemplates } from "@/lib/api-client";
import { NotesDashboard } from "./notes-dashboard";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const [data, trashData, categoriesData, templatesData] = await Promise.all([
    getNotesData(),
    getNotesTrash(),
    getNoteCategories(),
    getNoteTemplates(),
  ]);
  return (
    <NotesDashboard
      notes={(data?.notes ?? []) as never}
      trash={(trashData?.notes ?? []) as never}
      categories={(categoriesData?.categories ?? []) as never}
      templates={(templatesData?.templates ?? []) as never}
    />
  );
}
