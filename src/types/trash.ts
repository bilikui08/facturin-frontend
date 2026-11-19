export type TrashType = "customer" | "sale_point";

/** Un registro que la persona eliminó y puede restaurar. */
export interface TrashItem {
  type: TrashType;
  /** "Cliente" / "Punto de venta" */
  type_label: string;
  id: number;
  /** Nombre del registro ("Test 2 Monotributo", "1 - Sucursal") */
  label: string;
  deleted_at: string;
}

/** Una página de la papelera (no vence: crece con el tiempo, por eso se pagina). */
export interface TrashData {
  items: TrashItem[];
  total: number;
  page: number;
  per_page: number;
  last_page: number;
}

export interface RestoreResult {
  restored: { type: TrashType; id: number; label: string }[];
  failed: { type: TrashType; id: number; message: string }[];
}

export const trashKey = (item: { type: TrashType; id: number }): string => `${item.type}:${item.id}`;
