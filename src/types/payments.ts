export type PaymentMethod = "cash" | "transfer" | "check" | "card" | "other";
export type PaymentStatus = "confirmed" | "voided";

/** Una imputación: qué parte de un cobro paga una factura o una partida inicial. */
export interface Allocation {
  id: number;
  payment_id: number;
  invoice_id: number | null;
  opening_item_id: number | null;
  /** Qué paga, legible ("Factura C 0001-00000005", "Saldo inicial: ...") */
  target_label: string;
  /** Pesos con 2 decimales ("250.50") */
  amount: string;
  /** Cuenta hoy: no fue liberada, el cobro está confirmado y lo que paga no fue anulado */
  effective: boolean;
  created_at: string | null;
  created_by_name: string | null;
  released_at: string | null;
  release_reason: string | null;
}

export interface Payment {
  id: number;
  customer_id: number;
  customer_name: string | null;
  amount: string;
  /** Lo imputado a facturas y partidas */
  allocated: string;
  /** Lo que todavía no está imputado (un anticipo, si no hay deuda a la que aplicarlo) */
  available: string;
  currency: string;
  /** yyyy-mm-dd */
  payment_date: string;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  status: PaymentStatus;
  created_by_name: string | null;
  created_at: string | null;
  voided_at: string | null;
  voided_by: number | null;
  void_reason: string | null;
  /** Solo en el detalle de un cobro */
  allocations?: Allocation[];
}

export interface PaymentsPage {
  items: Payment[];
  meta: { total: number; page: number; per_page: number; last_page: number };
}

export interface PaymentFilters {
  customerId?: string;
  status?: PaymentStatus | "";
  dateFrom?: string;
  dateTo?: string;
  page: number;
  perPage: number;
}

export interface NewPayment {
  customer_id: number;
  amount: string;
  payment_date: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
}

/** Una línea de imputación para enviar: a una factura O a una partida inicial. */
export interface AllocationLine {
  invoice_id?: number;
  opening_item_id?: number;
  amount: string;
}

export type SuggestionOrder = "issue_date" | "due_date";

/** Una deuda pendiente del cliente con lo que propone el reparto FIFO. */
export interface SuggestionLine {
  kind: "invoice" | "opening_item";
  id: number;
  label: string;
  date: string;
  due_date: string | null;
  overdue: boolean;
  pending: string;
  suggested: string;
  pending_after: string;
}

export interface Suggestion {
  customer_id: number;
  payment_id: number | null;
  order: SuggestionOrder;
  amount: string;
  total_suggested: string;
  /** Lo que sobra y quedaría como anticipo */
  remainder: string;
  allocations: AllocationLine[];
  lines: SuggestionLine[];
}
