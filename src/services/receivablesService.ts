import type { CandidateGroup, NewOpeningItem, OpeningState, OpeningWarning } from "../types/receivables";
import { apiRequest } from "./apiClient";

/** Estado de la apertura de la cuenta corriente de la empresa (`opening: null` si todavía no se inició). */
export const getOpening = (signal?: AbortSignal): Promise<OpeningState> =>
  apiRequest<OpeningState>("/receivables/opening", { signal });

/** Crea el borrador de la apertura. El servidor toma ahí la foto de los comprobantes ya emitidos. */
export const startOpening = (openingDate: string): Promise<OpeningState> =>
  apiRequest<OpeningState>("/receivables/opening", { method: "POST", body: JSON.stringify({ opening_date: openingDate }) });

export const updateOpeningDate = (openingDate: string): Promise<OpeningState> =>
  apiRequest<OpeningState>("/receivables/opening", { method: "PUT", body: JSON.stringify({ opening_date: openingDate }) });

/** Comprobantes anteriores que todavía se pueden cargar como pendientes, agrupados por cliente (solo en borrador). */
export const getOpeningCandidates = (signal?: AbortSignal): Promise<CandidateGroup[]> =>
  apiRequest<CandidateGroup[]>("/receivables/opening/preview", { signal });

export const addOpeningItem = (item: NewOpeningItem): Promise<OpeningState> =>
  apiRequest<OpeningState>("/receivables/opening/items", { method: "POST", body: JSON.stringify(item) });

export const voidOpeningItem = (id: number): Promise<OpeningState> =>
  apiRequest<OpeningState>(`/receivables/opening/items/${id}/void`, { method: "POST" });

/** Cierra la apertura: desde ahí no se modifica. */
export const confirmOpening = (): Promise<OpeningState> =>
  apiRequest<OpeningState>("/receivables/opening/confirm", { method: "POST" });

export const getOpeningWarnings = (signal?: AbortSignal): Promise<OpeningWarning[]> =>
  apiRequest<OpeningWarning[]>("/receivables/opening/warnings", { signal });
