import { beforeEach, describe, expect, it, vi } from "vitest";
import { allocatePayment, getAllocationSuggestion, getPayment, listPayments, registerPayment, releaseAllocation, voidPayment } from "../paymentsService";

const apiRequest = vi.fn();
vi.mock("../apiClient", () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a) }));

describe("paymentsService", () => {
  beforeEach(() => apiRequest.mockReset().mockResolvedValue({}));

  it("lista con página y solo los filtros indicados", async () => {
    await listPayments({ page: 1, perPage: 20 });
    await listPayments({ customerId: "10", status: "voided", dateFrom: "2026-11-01", dateTo: "2026-11-30", page: 2, perPage: 50 });

    expect(apiRequest.mock.calls[0][0]).toBe("/payments?page=1&per_page=20");
    expect(apiRequest.mock.calls[1][0]).toBe("/payments?page=2&per_page=50&customer_id=10&status=voided&date_from=2026-11-01&date_to=2026-11-30");
  });

  it("registra un cobro con la clave de idempotencia en la cabecera, no en el cuerpo", async () => {
    await registerPayment({ customer_id: 10, amount: "1500.75", payment_date: "2026-11-19", method: "cash" }, "key-abc-12345");

    const [path, options] = apiRequest.mock.calls[0];
    expect(path).toBe("/payments");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Idempotency-Key": "key-abc-12345" });
    expect(JSON.parse(options.body)).toEqual({ customer_id: 10, amount: "1500.75", payment_date: "2026-11-19", method: "cash" });
  });

  it("imputa con la clave en la cabecera y solo las líneas en el cuerpo", async () => {
    await allocatePayment(3, [{ invoice_id: 7, amount: "400.00" }, { opening_item_id: 2, amount: "50.00" }], "alloc-key-0001");

    const [path, options] = apiRequest.mock.calls[0];
    expect(path).toBe("/payments/3/allocations");
    expect(options.headers).toEqual({ "Idempotency-Key": "alloc-key-0001" });
    expect(JSON.parse(options.body)).toEqual({ allocations: [{ invoice_id: 7, amount: "400.00" }, { opening_item_id: 2, amount: "50.00" }] });
  });

  it("anula con motivo, libera con o sin motivo y consulta un cobro", async () => {
    await voidPayment(3, "Se cargó dos veces");
    await releaseAllocation(5);
    await releaseAllocation(6, "Era otra factura");
    const signal = new AbortController().signal;
    await getPayment(3, signal);

    expect(apiRequest.mock.calls[0]).toEqual(["/payments/3/void", { method: "POST", body: JSON.stringify({ reason: "Se cargó dos veces" }) }]);
    expect(apiRequest.mock.calls[1]).toEqual(["/allocations/5/release", { method: "POST", body: "{}" }]);
    expect(apiRequest.mock.calls[2]).toEqual(["/allocations/6/release", { method: "POST", body: JSON.stringify({ reason: "Era otra factura" }) }]);
    expect(apiRequest.mock.calls[3]).toEqual(["/payments/3", { signal }]);
  });

  it("pide la sugerencia FIFO con el cobro, el importe y el orden que correspondan", async () => {
    await getAllocationSuggestion(10, { paymentId: 3 });
    await getAllocationSuggestion(10, { amount: "800.00", order: "due_date" });

    expect(apiRequest.mock.calls[0][0]).toBe("/customers/10/allocation-suggestion?payment_id=3");
    expect(apiRequest.mock.calls[1][0]).toBe("/customers/10/allocation-suggestion?amount=800.00&order=due_date");
  });
});
