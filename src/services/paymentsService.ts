import type { AllocationLine, NewPayment, Payment, PaymentFilters, PaymentsPage, Suggestion, SuggestionOrder } from "../types/payments";
import { apiRequest } from "./apiClient";

export const listPayments = (f: PaymentFilters, signal?: AbortSignal): Promise<PaymentsPage> => {
  const params = new URLSearchParams({ page: String(f.page), per_page: String(f.perPage) });
  if (f.customerId) params.set("customer_id", f.customerId);
  if (f.status) params.set("status", f.status);
  if (f.dateFrom) params.set("date_from", f.dateFrom);
  if (f.dateTo) params.set("date_to", f.dateTo);

  return apiRequest<PaymentsPage>(`/payments?${params}`, { signal });
};

/** El cobro con sus imputaciones. */
export const getPayment = (id: number, signal?: AbortSignal): Promise<Payment> => apiRequest<Payment>(`/payments/${id}`, { signal });

/**
 * Registra un cobro. `idempotencyKey` identifica el INTENTO: si el pedido se repite con la misma clave (doble envío, reintento tras
 * un corte de red) el servidor devuelve el cobro original en lugar de crear otro.
 */
export const registerPayment = (payment: NewPayment, idempotencyKey: string): Promise<Payment> =>
  apiRequest<Payment>("/payments", { method: "POST", body: JSON.stringify(payment), headers: { "Idempotency-Key": idempotencyKey } });

/** Anula el cobro (con motivo). El servidor libera sus imputaciones. */
export const voidPayment = (id: number, reason: string): Promise<Payment> =>
  apiRequest<Payment>(`/payments/${id}/void`, { method: "POST", body: JSON.stringify({ reason }) });

/** Imputa el cobro a facturas y partidas (todo o nada). Misma `Idempotency-Key` que en los cobros. Devuelve el cobro actualizado. */
export const allocatePayment = (id: number, allocations: AllocationLine[], idempotencyKey: string): Promise<Payment> =>
  apiRequest<Payment>(`/payments/${id}/allocations`, { method: "POST", body: JSON.stringify({ allocations }), headers: { "Idempotency-Key": idempotencyKey } });

/** Libera una imputación: el importe vuelve a estar disponible en el cobro. */
export const releaseAllocation = (id: number, reason?: string): Promise<Payment> =>
  apiRequest<Payment>(`/allocations/${id}/release`, { method: "POST", body: JSON.stringify(reason ? { reason } : {}) });

/** Propuesta de reparto FIFO (no guarda nada). Con `paymentId` parte de lo disponible de ese cobro. */
export const getAllocationSuggestion = (
  customerId: number,
  { amount, paymentId, order }: { amount?: string; paymentId?: number; order?: SuggestionOrder },
  signal?: AbortSignal,
): Promise<Suggestion> => {
  const params = new URLSearchParams();
  if (amount) params.set("amount", amount);
  if (paymentId) params.set("payment_id", String(paymentId));
  if (order) params.set("order", order);

  return apiRequest<Suggestion>(`/customers/${customerId}/allocation-suggestion?${params}`, { signal });
};
