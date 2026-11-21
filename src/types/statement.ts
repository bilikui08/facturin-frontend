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
  /** Factura o saldo inicial: lo que falta cobrar (no es un movimiento, no cambia el saldo) */
  pending: string | null;
  item_status: "pending" | "partial" | "paid" | "annulled" | null;
  /** Factura o saldo inicial: los cobros imputados a ella (también los liberados) */
  allocations: StatementAllocation[];
  /** Cobro: a qué facturas se imputó */
  imputed_to: StatementImputation[];
  /** Cobro: lo que todavía no se imputó (anticipo) */
  available: string | null;
}

export interface StatementAllocation {
  id: number;
  payment_id: number;
  /** "Cobro #7 · Transferencia (REF001)" */
  payment_label: string;
  amount: string;
  /** Cuenta hoy (si no, fue liberada o su cobro se anuló) */
  effective: boolean;
  released_at: string | null;
}

export interface StatementImputation {
  id: number;
  /** "Factura C 0001-00000073" */
  target_label: string;
  amount: string;
  effective: boolean;
  released_at: string | null;
}

/** Un comprobante del historial anterior a la apertura (solo informativo: no es un movimiento del libro). */
export interface HistoryVoucher {
  id: number;
  /** "Factura C 0001-00000072" */
  label: string;
  /** yyyy-mm-dd */
  date: string;
  total: string;
}

/** Factura anterior a la apertura anulada por su nota de crédito (también anterior), del mismo importe. */
export interface PreviousHistoryPair {
  invoice: HistoryVoucher;
  credit_note: HistoryVoucher;
  status: "compensated";
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
  /** Aparte del libro: no suma a débito, crédito ni saldo */
  previous_history: PreviousHistoryPair[];
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
