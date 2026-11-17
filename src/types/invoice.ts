export interface InvoiceRow {
  id: number | string;
  cbte_nro: number | string | null;
  issue_date: string | null;
  created_at: string | null;
  total: number | string | null;
  cae: string | null;
  cae_expiration: string | null;
  afip_environment?: string | null;
  /** Si es una nota de crédito: id de la factura que anula */
  associated_invoice_id?: number | string | null;
  voucher_type?: { description?: string; afip_code?: number | string } | null;
  /** Nota de crédito que anuló esta factura */
  credit_note?: { id: number | string; cbte_nro: number | string } | null;
  /** Factura anulada por esta nota de crédito */
  associated_invoice?: { id: number | string; cbte_nro: number | string } | null;
  customer_id: number | string;
  sale_point_id: number | string;
  customer?: { name?: string; document_number?: string } | null;
  sale_point?: { number?: number | string; name?: string } | null;
}

/** Respuesta paginada de Laravel (cuando se envía per_page). */
export interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}
