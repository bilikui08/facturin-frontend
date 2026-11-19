import type { RestoreResult, TrashData, TrashItem, TrashType } from "../types/trash";
import { apiRequest } from "./apiClient";

export interface TrashQuery {
  type?: TrashType;
  page: number;
  perPage: number;
}

/** Lo que la persona eliminó, de lo más nuevo a lo más viejo, por página y opcionalmente de un solo tipo. */
export const getTrash = ({ type, page, perPage }: TrashQuery, signal?: AbortSignal): Promise<TrashData> => {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (type) params.set("type", type);

  return apiRequest<TrashData>(`/trash?${params}`, { signal });
};

/** Restaura uno o varios registros. Informa cuáles se restauraron y cuáles no (y por qué). */
export const restoreTrashItems = (items: Pick<TrashItem, "type" | "id">[]): Promise<RestoreResult> =>
  apiRequest<RestoreResult>("/trash/restore", {
    method: "POST",
    body: JSON.stringify({ items: items.map(({ type, id }) => ({ type, id })) }),
  });
