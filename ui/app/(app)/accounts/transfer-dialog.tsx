"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createTransfer } from "./actions";
import { toast } from "sonner";

type AccountOpt = { id: string; name: string };

export function TransferDialog({
  open,
  onOpenChange,
  accounts,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: AccountOpt[];
  onSuccess?: () => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [localErrors, setLocalErrors] = useState<{
    from_account_id?: string;
    to_account_id?: string;
    amount?: string;
  }>({});
  const [state, formAction, isPending] = useActionState(createTransfer, null);

  useEffect(() => {
    if (state?.success) {
      toast.success("Transfer created");
      onOpenChange(false);
      onSuccess?.();
    }
  }, [state?.success]);

  // Reset selections + errors whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setFrom("");
      setTo("");
      setLocalErrors({});
    }
  }, [open]);

  // Frontend-first: block the POST until every field is valid.
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const data = new FormData(e.currentTarget);
    const amount = String(data.get("amount") ?? "");
    const next: typeof localErrors = {};
    if (!from) next.from_account_id = "Select the source account.";
    if (!to) next.to_account_id = "Select the destination account.";
    if (from && to && from === to)
      next.to_account_id = "Choose a different account.";
    if (!amount || Number(amount) <= 0)
      next.amount = "Enter a valid amount.";
    setLocalErrors(next);
    if (Object.keys(next).length > 0) e.preventDefault();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer between accounts</DialogTitle>
          <DialogDescription>Move money between your own accounts. Not treated as income or expense.</DialogDescription>
        </DialogHeader>

        <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From *</Label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="from_account_id" value={from} />
              {(localErrors.from_account_id ?? state?.fieldErrors?.from_account_id) && <p className="text-xs text-error-dark">{localErrors.from_account_id ?? state?.fieldErrors?.from_account_id}</p>}
            </div>
            <div className="space-y-2">
              <Label>To *</Label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="to_account_id" value={to} />
              {(localErrors.to_account_id ?? state?.fieldErrors?.to_account_id) && <p className="text-xs text-error-dark">{localErrors.to_account_id ?? state?.fieldErrors?.to_account_id}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tr-amount">Amount *</Label>
            <Input id="tr-amount" name="amount" type="number" step="0.01" placeholder="1000" required />
            {(localErrors.amount ?? state?.fieldErrors?.amount) && <p className="text-xs text-error-dark">{localErrors.amount ?? state?.fieldErrors?.amount}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="tr-date">Date</Label>
            <Input id="tr-date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tr-notes">Notes</Label>
            <Textarea id="tr-notes" name="notes" placeholder="Optional" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Processing..." : "Transfer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
