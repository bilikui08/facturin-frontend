import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvoiceRow } from "../../types/invoice";
import InvoiceActions from "../InvoiceActions";

const apiRequest = vi.fn();

vi.mock("../../services/apiClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const invoice = (extra: Record<string, unknown> = {}) =>
  ({
    id: 5,
    cbte_nro: 74,
    sale_point: { number: 1 },
    total: "1500.50",
    cae: "86461089494558",
    ...extra,
  }) as unknown as InvoiceRow;

describe("InvoiceActions", () => {
  beforeEach(() => {
    apiRequest.mockReset().mockResolvedValue({});
  });

  it("anular pide confirmación e informa el importe y el número", async () => {
    render(<InvoiceActions invoice={invoice()} />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(screen.getByRole("button", { name: "Anular" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/0001-00000074/)).toBeTruthy();
    expect(within(dialog).getByText(/1\.500,50/)).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("cancelar no emite la nota de crédito", async () => {
    render(<InvoiceActions invoice={invoice()} />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(screen.getByRole("button", { name: "Anular" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));

    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("confirmar emite la nota de crédito y avisa que cambió el listado", async () => {
    const onChanged = vi.fn();
    render(<InvoiceActions invoice={invoice()} onChanged={onChanged} />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(screen.getByRole("button", { name: "Anular" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Anular comprobante" }),
    );

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(apiRequest).toHaveBeenCalledWith("/invoices/5/credit-note", { method: "POST" });
  });

  it("no ofrece anular una factura ya anulada ni una nota de crédito", () => {
    const { rerender } = render(<InvoiceActions invoice={invoice({ credit_note: { cbte_nro: 2 } })} />);
    expect(screen.queryByRole("button", { name: "Anular" })).toBeNull();

    rerender(<InvoiceActions invoice={invoice({ associated_invoice_id: 3 })} />);
    expect(screen.queryByRole("button", { name: "Anular" })).toBeNull();
  });

  it("muestra el error si falla la anulación", async () => {
    apiRequest.mockRejectedValue(new Error("AFIP error 10237: supera el monto"));
    render(<InvoiceActions invoice={invoice()} />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(screen.getByRole("button", { name: "Anular" }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Anular comprobante" }),
    );

    expect(await screen.findByText(/AFIP error 10237/)).toBeTruthy();
  });
});
