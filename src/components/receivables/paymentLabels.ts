import type { PaymentMethod } from "../../types/payments";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  check: "Cheque",
  card: "Tarjeta",
  other: "Otro medio",
};

export const METHODS = Object.keys(METHOD_LABELS) as PaymentMethod[];
