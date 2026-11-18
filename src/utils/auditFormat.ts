import type { AuditLogRow } from "../types/audit";

export type AuditTone = "success" | "secondary" | "destructive" | "default";

/** Acciones que registra billing, con su texto y color. El orden es el del filtro de la pantalla. */
export const AUDIT_ACTIONS: Record<string, { label: string; tone: AuditTone }> = {
  "invoice.issued": { label: "Factura emitida", tone: "success" },
  "credit_note.issued": { label: "Nota de crédito emitida", tone: "success" },
  "invoice.annulled": { label: "Factura anulada", tone: "destructive" },
  "customer.created": { label: "Cliente creado", tone: "success" },
  "customer.updated": { label: "Cliente modificado", tone: "secondary" },
  "customer.deleted": { label: "Cliente dado de baja", tone: "destructive" },
  "customer.restored": { label: "Cliente restaurado", tone: "default" },
  "customer.purged": { label: "Cliente eliminado definitivamente", tone: "destructive" },
  "sale_point.created": { label: "Punto de venta creado", tone: "success" },
  "sale_point.updated": { label: "Punto de venta modificado", tone: "secondary" },
  "sale_point.deleted": { label: "Punto de venta dado de baja", tone: "destructive" },
  "sale_point.restored": { label: "Punto de venta restaurado", tone: "default" },
  "sale_point.purged": { label: "Punto de venta eliminado definitivamente", tone: "destructive" },
  "billing_profile.created": { label: "Perfil fiscal creado", tone: "success" },
  "billing_profile.updated": { label: "Perfil fiscal modificado", tone: "secondary" },
  "billing_profile.deleted": { label: "Perfil fiscal eliminado", tone: "destructive" },
};

export const AUDIT_TYPES: Record<string, string> = {
  invoice: "Comprobante",
  customer: "Cliente",
  sale_point: "Punto de venta",
  billing_profile: "Perfil fiscal",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  first_name: "Nombre",
  last_name: "Apellido",
  business_name: "Razón social",
  fantasy_name: "Nombre de fantasía",
  document_number: "Número de documento",
  document_type_id: "Tipo de documento (id)",
  tax_condition_id: "Condición frente al IVA (id)",
  address: "Domicilio",
  gross_income_number: "Ingresos brutos",
  activity_start_date: "Inicio de actividades",
  number: "Número",
  user_billing_profile_id: "Perfil de facturación (id)",
  voucher: "Comprobante",
  afip_code: "Código AFIP",
  total: "Total",
  customer: "Cliente",
  customer_id: "Cliente (id)",
  cae: "CAE",
  cae_expiration: "Vencimiento del CAE",
  environment: "Ambiente",
  issue_date: "Fecha de emisión",
  annuls_invoice_id: "Anula la factura (id)",
  annuls_voucher: "Anula el comprobante",
  credit_note: "Nota de crédito",
  credit_note_id: "Nota de crédito (id)",
};

export const auditActionLabel = (action: string): string => AUDIT_ACTIONS[action]?.label ?? action;

export const auditActionTone = (action: string): AuditTone => AUDIT_ACTIONS[action]?.tone ?? "secondary";

/** "Cliente #3" */
export const auditRecordLabel = (row: Pick<AuditLogRow, "auditable_type" | "auditable_id">): string => {
  const type = AUDIT_TYPES[row.auditable_type] ?? row.auditable_type;
  return row.auditable_id == null ? type : `${type} #${row.auditable_id}`;
};

/** El nombre guardado en el momento de la acción; si no hay (registros anteriores), "Usuario N". */
export const auditUserLabel = (userId: number | null, name?: string | null): string => {
  if (name) return name;
  return userId == null ? "Sistema" : `Usuario ${userId}`;
};

/** Fecha y hora local (la API entrega un instante ISO). "18/11/2026 19:57" */
export const formatDateTime = (value: string | null): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export interface AuditDetailRow {
  field: string;
  /** Valor actual (alta, baja, datos del comprobante). */
  value?: string;
  /** Solo en ediciones: lo que había y lo que quedó. */
  old?: string;
  new?: string;
}

const display = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const label = (field: string): string => FIELD_LABELS[field] ?? field;

/** Convierte el detalle de una entrada en filas legibles para mostrar en la pantalla. */
export const auditDetailRows = (changes: Record<string, unknown> | null): AuditDetailRow[] => {
  if (!changes) return [];

  const edits = changes.changes;
  if (edits && typeof edits === "object") {
    return Object.entries(edits as Record<string, { old?: unknown; new?: unknown }>).map(([field, change]) => ({
      field: label(field),
      old: display(change?.old),
      new: display(change?.new),
    }));
  }

  const flat = changes.values && typeof changes.values === "object" ? (changes.values as Record<string, unknown>) : changes;

  return Object.entries(flat).map(([field, value]) => ({ field: label(field), value: display(value) }));
};
