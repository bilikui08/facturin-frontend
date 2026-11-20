import type { CustomerBalance, Statement, StatementFilters } from "../types/statement";
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

/** Estado de cuenta de un cliente: saldo inicial del período, movimientos con saldo acumulado y totales (paginado). */
export const getAccountStatement = (customerId: number, f: StatementFilters, signal?: AbortSignal): Promise<Statement> => {
  const query = new URLSearchParams({ page: String(f.page), per_page: String(f.perPage) });
  if (f.from) query.set("from", f.from);
  if (f.to) query.set("to", f.to);

  return apiRequest<Statement>(`/customers/${customerId}/account-statement?${query}`, { signal });
};

/** Saldo global del cliente: lo que debe, lo pendiente de sus facturas y el crédito a favor. */
export const getCustomerBalance = (customerId: number, signal?: AbortSignal): Promise<CustomerBalance> =>
  apiRequest<CustomerBalance>(`/customers/${customerId}/balance`, { signal });
