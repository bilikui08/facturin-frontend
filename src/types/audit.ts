/** Entrada del registro de auditoría de billing (solo lectura). */
export interface AuditLogRow {
  id: number;
  created_at: string | null;
  /** Quién ejecutó la acción (id de auth-api). Null si fue una tarea de consola. */
  user_id: number | null;
  owner_id: number | null;
  action: string;
  auditable_type: string;
  auditable_id: number | null;
  /** Detalle: `values` (alta/baja), `changes` (edición, antes y después) o datos del comprobante. */
  changes: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
}
