"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createQuickTransaction } from "./actions";
import { toast } from "sonner";
import { Delete, Check } from "lucide-react";
import { useRouter } from "next/navigation";

type AccountOpt = { id: string; name: string };
type CategoryOpt = { id: string; name: string; parent_id: string | null };

export function QuickAddForm({
  accounts,
  categories,
  recentMerchants,
}: {
  accounts: AccountOpt[];
  categories: CategoryOpt[];
  recentMerchants: string[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [showMerchantSuggest, setShowMerchantSuggest] = useState(false);

  const [state, formAction, isPending] = useActionState(createQuickTransaction, null);

  useEffect(() => {
    if (state?.success) {
      toast.success(`${type === "income" ? "Income" : "Expense"} added`);
      setAmount("");
      setMerchant("");
      setCategoryId("");
      router.refresh();
    }
    if (state?.error) toast.error(state.error);
  }, [state]);

  const handleKey = (key: string) => {
    if (key === "C") {
      setAmount("");
      return;
    }
    if (key === "⌫") {
      setAmount((a) => a.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (amount.includes(".")) return;
      setAmount((a) => (a === "" ? "0." : a + "."));
      return;
    }
    // digit
    if (amount === "0") setAmount(key);
    else setAmount((a) => (a + key).slice(0, 10));
  };

  const displayAmount = amount === "" ? "0" : amount;

  // Filter merchants
  const filteredMerchants = recentMerchants.filter((m) => merchant === "" || m.toLowerCase().includes(merchant.toLowerCase())).slice(0, 5);

  return (
    <div className="max-w-md mx-auto space-y-6">
      <Card className="p-6">
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="amount" value={amount} />
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="account_id" value={accountId} />
          <input type="hidden" name="category_id" value={categoryId} />
          <input type="hidden" name="merchant_clean" value={merchant} />
          <input type="hidden" name="date" value={date} />

          {state?.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {state?.fieldErrors?.amount && <p className="text-xs text-error-dark">{state.fieldErrors.amount}</p>}
          {state?.fieldErrors?.account_id && <p className="text-xs text-error-dark">{state.fieldErrors.account_id}</p>}

          {/* Type toggle */}
          <div className="flex gap-2">
            <Button type="button" variant={type === "expense" ? "default" : "outline"} className="flex-1" onClick={() => setType("expense")}>
              Expense
            </Button>
            <Button type="button" variant={type === "income" ? "default" : "outline"} className="flex-1" onClick={() => setType("income")}>
              Income
            </Button>
          </div>

          {/* Amount display */}
          <div className="text-center py-4">
            <p className="text-sm text-neutral-500 font-heading">Amount</p>
            <p className={`text-5xl font-extrabold font-heading tracking-tight ${type === "expense" ? "text-error" : "text-success"}`}>
              <span className="text-2xl align-super">₹</span> {displayAmount}
            </p>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
              <Button key={k} type="button" variant={k === "⌫" ? "ghost" : "outline"} className="h-12 text-lg font-semibold" onClick={() => handleKey(k)}>
                {k === "⌫" ? <Delete className="h-5 w-5" /> : k}
              </Button>
            ))}
            <Button type="button" variant="ghost" className="h-12 col-span-3" onClick={() => handleKey("C")}>
              Clear
            </Button>
          </div>

          {/* Account */}
          <div className="space-y-2">
            <Label>Account *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
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
          </div>

          {/* Category chips */}
          <div className="space-y-2">
            <Label>Category</Label>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              <Button type="button" variant={categoryId === "" ? "default" : "outline"} size="sm" onClick={() => setCategoryId("")}>
                No category
              </Button>
              {categories.slice(0, 20).map((c) => (
                <Button key={c.id} type="button" variant={categoryId === c.id ? "default" : "outline"} size="sm" onClick={() => setCategoryId(c.id)}>
                  {c.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Merchant with suggestions */}
          <div className="space-y-2 relative">
            <Label htmlFor="qa-merchant">Merchant / Description</Label>
            <Input
              id="qa-merchant"
              value={merchant}
              onChange={(e) => {
                setMerchant(e.target.value);
                setShowMerchantSuggest(true);
              }}
              onFocus={() => setShowMerchantSuggest(true)}
              placeholder="e.g. Big Bazaar, Swiggy"
              autoComplete="off"
            />
            {showMerchantSuggest && filteredMerchants.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-neutral-200 rounded-md shadow-lg max-h-32 overflow-auto">
                {filteredMerchants.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50"
                    onClick={() => {
                      setMerchant(m);
                      setShowMerchantSuggest(false);
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="qa-date">Date</Label>
            <Input id="qa-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <Button type="submit" className="w-full h-12 text-base" disabled={isPending || !amount || Number(amount) <= 0}>
            {isPending ? "Saving..." : (
              <>
                <Check className="h-5 w-5" /> Save {type}
              </>
            )}
          </Button>
        </form>
      </Card>

      <p className="text-center text-xs text-neutral-400">Quick Add creates a transaction instantly. For transfers, use the Accounts page.</p>
    </div>
  );
}
