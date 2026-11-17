import type { InvoiceRow } from "../types/invoice";

/** "0001-00000068": punto de venta (4 dígitos) - número de comprobante (8 dígitos). */
export const formatInvoiceNumber = (invoice: InvoiceRow): string => {
  const pv = String(invoice.sale_point?.number ?? "").padStart(4, "0");
  const nro = String(invoice.cbte_nro ?? "").padStart(8, "0");
  return invoice.cbte_nro == null ? "—" : `${pv}-${nro}`;
};

/** yyyy-mm-dd... -> dd/mm/aaaa ("—" si no hay fecha). */
export const formatDate = (value: unknown): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
};

export const isCreditNote = (invoice: InvoiceRow): boolean =>
  invoice.associated_invoice_id != null;

/** Importe en pesos argentinos ("$ 1.500,50"). */
export const formatMoney = (value: unknown): string =>
  Number(value ?? 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
