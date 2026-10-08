"use client";

import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import type { ActionState } from "@moneymind/api";
import { FormFooter } from "./form-primitives";

/**
 * Shared success effect for entity form dialogs: toast + close + refresh
 * on action success. Replaces ~10 copy-pasted useEffect blocks.
 */
export function useEntityFormSuccess(opts: {
  state: ActionState | null;
  isEdit: boolean;
  entityLabel: string;
  onOpenChange: (v: boolean) => void;
  onSuccess?: () => void;
}) {
  const { state, isEdit, entityLabel, onOpenChange, onSuccess } = opts;
  const success = state?.success;
  // Callbacks in refs: parents pass inline arrows (new identity per render);
  // depending on them would re-fire success handling in a refresh loop.
  const cbRef = useRef({ onOpenChange, onSuccess });
  cbRef.current = { onOpenChange, onSuccess };
  useEffect(() => {
    if (success) {
      toast.success(isEdit ? `${entityLabel} updated` : `${entityLabel} created`);
      cbRef.current.onOpenChange(false);
      cbRef.current.onSuccess?.();
    }
  }, [success, isEdit, entityLabel]);
}

/**
 * Shared dialog shell for entity create/edit forms: Dialog chrome, header,
 * form wrapper with remount key, error alert, and footer. Field markup,
 * validation, and hidden id/version inputs stay in the caller.
 */
export function EntityFormDialog({
  open,
  onOpenChange,
  title,
  description,
  formKey,
  formAction,
  onSubmit,
  state,
  isEdit,
  isPending,
  footer,
  contentClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  formKey?: string | number;
  formAction: (payload: FormData) => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  state: ActionState | null;
  isEdit: boolean;
  isPending: boolean;
  footer?: ReactNode;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form key={formKey} action={formAction} onSubmit={onSubmit} className="space-y-4">
          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {children}
          {footer ?? (
            <FormFooter onCancel={() => onOpenChange(false)} pending={isPending} isEdit={isEdit} />
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
