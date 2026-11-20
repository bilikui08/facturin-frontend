import type { Allocation, Payment, PaymentsPage, Suggestion, SuggestionLine } from "../types/payments";

export const payment = (extra: Partial<Payment> = {}): Payment => ({
  id: 1, customer_id: 10, customer_name: "Acme SA", amount: "1000.00", allocated: "0.00", available: "1000.00", currency: "ARS",
  payment_date: "2026-11-18", method: "transfer", reference: "TRX-1", notes: null, status: "confirmed", created_by_name: "Ana",
  created_at: "2026-11-18T10:00:00-03:00", voided_at: null, voided_by: null, void_reason: null, ...extra,
});

export const page = (items: Payment[], meta: Partial<PaymentsPage["meta"]> = {}): PaymentsPage => ({
  items, meta: { total: items.length, page: 1, per_page: 20, last_page: 1, ...meta },
});

export const allocation = (extra: Partial<Allocation> = {}): Allocation => ({
  id: 5, payment_id: 1, invoice_id: 7, opening_item_id: null, target_label: "Factura C 0001-00000007", amount: "400.00", effective: true,
  created_at: "2026-11-19T09:00:00-03:00", created_by_name: "Ana", released_at: null, release_reason: null, ...extra,
});

export const line = (extra: Partial<SuggestionLine> = {}): SuggestionLine => ({
  kind: "invoice", id: 7, label: "Factura C 0001-00000007", date: "2026-10-01", due_date: null, overdue: false, pending: "400.00", suggested: "400.00", pending_after: "0.00", ...extra,
});

export const suggestion = (lines: SuggestionLine[], extra: Partial<Suggestion> = {}): Suggestion => {
  const total = lines.reduce((sum, l) => sum + Math.round(Number(l.suggested) * 100), 0);
  return {
    customer_id: 10, payment_id: 1, order: "issue_date", amount: "1000.00", total_suggested: (total / 100).toFixed(2), remainder: "0.00",
    allocations: lines.filter((l) => Number(l.suggested) > 0).map((l) => ({ [l.kind === "invoice" ? "invoice_id" : "opening_item_id"]: l.id, amount: l.suggested })),
    lines, ...extra,
  };
};

export const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
