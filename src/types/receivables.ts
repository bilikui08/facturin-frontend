/** Estado de la apertura de la cuenta corriente de la empresa. */
export type OpeningStatus = "draft" | "confirmed";

export interface Opening {
  id: number;
  /** yyyy-mm-dd */
  opening_date: string;
  status: OpeningStatus;
  confirmed_at: string | null;
  confirmed_by: number | null;
  /** Cantidad de comprobantes anteriores a la apertura (la "foto" que toma el servidor). */
  historical_invoices: number;
}

/** Lo que un cliente debía cuando se abrió la cuenta corriente: de un comprobante anterior o un saldo libre. */
export interface OpeningItem {
  id: number;
  customer_id: number;
  customer_name: string | null;
  invoice_id: number | null;
  invoice_number: string | null;
  /** Pesos con 2 decimales ("250.50") */
  amount: string;
  description: string | null;
  voided_at: string | null;
}

export interface OpeningState {
  /** null: la empresa todavía no inició su cuenta corriente */
  opening: Opening | null;
  items: OpeningItem[];
  totals: { items: number; amount: string };
}

/** Un comprobante anterior a la apertura que todavía se puede cargar como pendiente. */
export interface CandidateInvoice {
  invoice_id: number;
  number: string;
  issue_date: string;
  payment_due_date: string | null;
  total: string;
}

export interface CandidateGroup {
  customer_id: number;
  customer_name: string;
  invoices: CandidateInvoice[];
}

/** Nota de crédito posterior a la apertura sobre un comprobante anterior: no se aplicó por completo, se regulariza a mano. */
export interface OpeningWarning {
  type: "historical_invoice_not_carried" | "exceeds_opening_item";
  credit_note_id: number;
  credit_note_number: string;
  issue_date: string;
  credit_note_total: string;
  invoice_id: number;
  invoice_number: string;
  customer_id: number;
  customer_name: string;
  opening_amount: string | null;
  applied: string;
  excess: string;
}

export interface NewOpeningItem {
  customer_id: number;
  invoice_id?: number;
  amount: string;
  description?: string;
}
