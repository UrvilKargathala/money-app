"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createInlineCategory } from "@/app/(app)/category-actions";

type CategoryOpt = { id: string; name: string; parent_id?: string | null };
type SpecialOption = { value: string; label: string };

export function CategorySelectWithCreate({
  value,
  onValueChange,
  categories,
  label = "Category",
  placeholder = "Select category",
  emptyOption = { value: "none", label: "No category" },
  parentCategoryId = null,
}: {
  value: string;
  onValueChange: (value: string) => void;
  categories: CategoryOpt[];
  label?: string;
  placeholder?: string;
  emptyOption?: SpecialOption | null;
  parentCategoryId?: string | null;
}) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [localCategories, setLocalCategories] = useState<CategoryOpt[]>([]);
  const [isPending, startTransition] = useTransition();

  const mergedCategories = useMemo(() => {
    const byId = new Map<string, CategoryOpt>();
    for (const category of categories) byId.set(category.id, category);
    for (const category of localCategories) byId.set(category.id, category);
    return Array.from(byId.values());
  }, [categories, localCategories]);

  const topCategories = mergedCategories.filter((category) => !category.parent_id);
  const childCategories = mergedCategories.filter((category) => category.parent_id);

  const handleCreate = () => {
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Please enter a category name.");
      return;
    }

    const formData = new FormData();
    formData.set("name", trimmed);
    if (parentCategoryId) formData.set("parent_id", parentCategoryId);

    startTransition(async () => {
      const result = await createInlineCategory(formData);
      if (result?.error || result?.fieldErrors) {
        setError(result.error || result.fieldErrors?.name || "Could not create category.");
        return;
      }
      if (result?.category) {
        setLocalCategories((current) => [...current, result.category!]);
        onValueChange(result.category.id);
      }
      setName("");
      setIsAdding(false);
      toast.success("Category added");
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {emptyOption && <SelectItem value={emptyOption.value}>{emptyOption.label}</SelectItem>}
          {topCategories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
          {childCategories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              - {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isAdding ? (
        <div className="rounded-lg border border-line bg-sunken p-3">
          <div className="flex gap-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New category name" />
            <Button type="button" size="icon" onClick={handleCreate} disabled={isPending} aria-label="Save category">
              <Plus className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="outline" onClick={() => setIsAdding(false)} aria-label="Cancel category">
              <X className="h-4 w-4" />
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-error-dark">{error}</p>}
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" className="px-0 text-primary-600 hover:bg-transparent" onClick={() => setIsAdding(true)}>
          <Plus className="h-4 w-4" /> Add category
        </Button>
      )}
    </div>
  );
}
