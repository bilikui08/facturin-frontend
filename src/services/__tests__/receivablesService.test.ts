import { beforeEach, describe, expect, it, vi } from "vitest";
import { addOpeningItem, confirmOpening, getOpening, getOpeningCandidates, getOpeningWarnings, startOpening, updateOpeningDate, voidOpeningItem } from "../receivablesService";

const apiRequest = vi.fn();
vi.mock("../apiClient", () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a) }));

describe("receivablesService", () => {
  beforeEach(() => apiRequest.mockReset().mockResolvedValue({}));

  it("consulta el estado, los comprobantes anteriores y las advertencias", async () => {
    const signal = new AbortController().signal;
    await getOpening(signal);
    await getOpeningCandidates(signal);
    await getOpeningWarnings(signal);

    expect(apiRequest.mock.calls).toEqual([
      ["/receivables/opening", { signal }],
      ["/receivables/opening/preview", { signal }],
      ["/receivables/opening/warnings", { signal }],
    ]);
  });

  it("inicia el borrador y cambia su fecha con la fecha en ISO", async () => {
    await startOpening("2026-11-19");
    await updateOpeningDate("2026-11-18");

    expect(apiRequest.mock.calls[0]).toEqual(["/receivables/opening", { method: "POST", body: JSON.stringify({ opening_date: "2026-11-19" }) }]);
    expect(apiRequest.mock.calls[1]).toEqual(["/receivables/opening", { method: "PUT", body: JSON.stringify({ opening_date: "2026-11-18" }) }]);
  });

  it("carga una partida con su comprobante o como saldo libre, con el importe como texto", async () => {
    await addOpeningItem({ customer_id: 3, invoice_id: 9, amount: "250.50" });
    await addOpeningItem({ customer_id: 3, amount: "100", description: "Saldo anterior" });

    expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toEqual({ customer_id: 3, invoice_id: 9, amount: "250.50" });
    expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toEqual({ customer_id: 3, amount: "100", description: "Saldo anterior" });
    expect(apiRequest.mock.calls[0][0]).toBe("/receivables/opening/items");
  });

  it("anula una partida y confirma la apertura con POST", async () => {
    await voidOpeningItem(12);
    await confirmOpening();

    expect(apiRequest.mock.calls).toEqual([
      ["/receivables/opening/items/12/void", { method: "POST" }],
      ["/receivables/opening/confirm", { method: "POST" }],
    ]);
  });
});
