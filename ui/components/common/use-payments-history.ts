"use client";

import { useCallback, useEffect, useState } from "react";

export type PaymentRow = {
  id: string;
  amount: number;
  period_label: string;
  period_month: number;
  period_year: number;
  notes: string | null;
  created_at: string;
  transaction_id?: string | null;
};

/**
 * Shared payments-history loader for entity dialogs (bills, subscriptions).
 * Same states as the previously duplicated per-dialog implementations:
 * loading spinner, loadError with retry, empty list, numeric amounts.
 */
export function usePaymentsHistory(entityId: string | null, open: boolean, basePath: string) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    if (!entityId) return;
    setLoading(true);
    setLoadError(false);
    fetch(`${basePath}/${entityId}/payments`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) =>
        setPayments(
          (data.payments ?? []).map((payment: { amount: string | number }) => ({
            ...payment,
            amount: Number(payment.amount),
          }))
        )
      )
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [entityId, basePath]);

  useEffect(() => {
    if (!open || !entityId) return;
    load();
  }, [open, entityId, load]);

  return { payments, loading, loadError, reload: load };
}
