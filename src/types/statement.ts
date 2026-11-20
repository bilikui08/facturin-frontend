/** Qué es cada renglón del estado de cuenta (el orden de un mismo día es este). */
export type StatementKind = "opening_item" | "invoice" | "credit_note" | "payment" | "payment_void";

export interface StatementLine {
  /** yyyy-mm-dd */
  date: string;
  kind: StatementKind;
  /** Id de la partida, factura, nota de crédito o cobro de origen */
  source_id: number;
  /** "Factura C 0001-00000005", "Cobro #12 (Transferencia)"… */
  concept: string;
  /** Pesos con 2 decimales; solo uno de los dos es mayor que cero */
  debit: string;
  credit: string;
  /** Saldo acumulado después de este renglón (positivo: el cliente debe) */
  balance: string;
  note: string | null;
}

export interface Statement {
  customer: { id: number; name: string };
  from: string | null;
  to: string | null;
  /** Lo que arrastra el cliente antes del período */
  opening_balance: string;
  debit: string;
  credit: string;
  closing_balance: string;
  lines: StatementLine[];
  meta: { total: number; page: number; per_page: number; last_page: number };
}

export type BalanceStatus = "debtor" | "creditor" | "even";

export interface CustomerBalance {
  customer_id: number;
  debit: string;
  credit: string;
  balance: string;
  /** Lo que sigue sin pagar de sus facturas */
  pending: string;
  /** Cobros a favor todavía sin imputar */
  available_credit: string;
  status: BalanceStatus;
}

export interface StatementFilters {
  from?: string;
  to?: string;
  page: number;
  perPage: number;
}
