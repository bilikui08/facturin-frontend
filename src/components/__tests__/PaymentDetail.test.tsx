import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "../../config/permissions";
import { ApiError } from "../../services/apiClient";
import { signIn, signOut } from "../../test/session";
import { allocation, deferred, page, payment } from "../../test/payments";
import type { Payment } from "../../types/payments";
import PaymentsPanel from "../receivables/PaymentsPanel";

const listPayments = vi.fn();
const getPayment = vi.fn();
const voidPayment = vi.fn();
const releaseAllocation = vi.fn();
const getAllocationSuggestion = vi.fn();
const getResources = vi.fn();

vi.mock("../../services/paymentsService", () => ({
  listPayments: (...a: unknown[]) => listPayments(...a),
  getPayment: (...a: unknown[]) => getPayment(...a),
  registerPayment: vi.fn(),
  voidPayment: (...a: unknown[]) => voidPayment(...a),
  allocatePayment: vi.fn(),
  releaseAllocation: (...a: unknown[]) => releaseAllocation(...a),
  getAllocationSuggestion: (...a: unknown[]) => getAllocationSuggestion(...a),
}));
vi.mock("../../services/crudService", () => ({ getResources: (...a: unknown[]) => getResources(...a) }));

const as = (...permissions: string[]) => signIn({ organizationId: 1, permissions });
const ALL = [P.paymentView, P.paymentManage, P.paymentAllocate];

const withAllocations: Payment = payment({
  allocated: "400.00", available: "600.00",
  allocations: [
    allocation({ id: 5, target_label: "Factura C 0001-00000007", amount: "400.00" }),
    allocation({ id: 6, target_label: "Factura C 0001-00000008", amount: "100.00", effective: false, released_at: "2026-11-19T11:00:00-03:00", release_reason: "Liberada manualmente" }),
    allocation({ id: 7, target_label: "Saldo inicial: Saldo libre", amount: "50.00", effective: false, invoice_id: null, opening_item_id: 2 }),
  ],
});

const open = async (p: Payment = withAllocations) => {
  listPayments.mockResolvedValue(page([payment({ id: p.id, available: p.available, allocated: p.allocated })]));
  getPayment.mockResolvedValue(p);
  render(<MemoryRouter><PaymentsPanel openingDate="2026-11-10" /></MemoryRouter>);
  await userEvent.click(await screen.findByRole("button", { name: `Ver cobro ${p.id}` }));
  return within(await screen.findByRole("dialog"));
};

beforeEach(() => {
  as(...ALL);
  listPayments.mockReset();
  getPayment.mockReset();
  voidPayment.mockReset().mockResolvedValue(payment({ status: "voided" }));
  releaseAllocation.mockReset().mockResolvedValue(payment());
  getAllocationSuggestion.mockReset().mockResolvedValue({ customer_id: 10, payment_id: 1, order: "issue_date", amount: "0.00", total_suggested: "0.00", remainder: "0.00", allocations: [], lines: [] });
  getResources.mockReset().mockResolvedValue([{ id: 10, name: "Acme SA" }]);
});

afterEach(() => signOut());

describe("Detalle de un cobro", () => {
  it("muestra los datos del cobro, los importes y quién lo registró", async () => {
    const dialog = await open(payment({ notes: "En mano", allocations: [] }));

    expect(await dialog.findByText("Acme SA")).toBeTruthy();
    expect(dialog.getByText("18/11/2026")).toBeTruthy();
    expect(dialog.getByText(/Transferencia · TRX-1/)).toBeTruthy();
    expect(dialog.getByText(/Ana/)).toBeTruthy();
    expect(dialog.getByText("En mano")).toBeTruthy();
    expect(dialog.getByText("Importe").nextSibling?.textContent).toMatch(/1\.000,00/);
    expect(dialog.getByText("Todavía no se imputó a ninguna deuda.")).toBeTruthy();
  });

  it("lista las imputaciones diciendo qué paga cada una y su estado (vigente, liberada, sin efecto)", async () => {
    const dialog = await open();

    expect(await dialog.findByText("Factura C 0001-00000007")).toBeTruthy();
    expect(dialog.getByText("Vigente")).toBeTruthy();
    expect(dialog.getByText("Liberada")).toBeTruthy();
    expect(dialog.getByText("Sin efecto")).toBeTruthy();
    expect(dialog.getByText(/Liberada manualmente/)).toBeTruthy();
    expect(dialog.getByText("Saldo inicial: Saldo libre")).toBeTruthy();
    // Solo la vigente se puede liberar
    expect(dialog.getAllByRole("button", { name: /^Liberar imputación/ })).toHaveLength(1);
  });

  describe("liberar una imputación", () => {
    it("pide confirmación explicando qué pasa y libera una sola vez aunque se haga doble click", async () => {
      const slow = deferred<Payment>();
      releaseAllocation.mockReturnValue(slow.promise);
      const dialog = await open();

      await userEvent.click(await dialog.findByRole("button", { name: "Liberar imputación a Factura C 0001-00000007" }));
      const confirm = within(await screen.findByRole("alertdialog"));
      expect(confirm.getByText(/vuelve a figurar pendiente y el importe queda disponible/)).toBeTruthy();
      expect(releaseAllocation).not.toHaveBeenCalled();

      await userEvent.click(confirm.getByRole("button", { name: "Sí, liberar" }));
      await userEvent.dblClick(confirm.getByRole("button", { name: /Sí, liberar/ }));
      expect(confirm.getByRole("status", { name: "Liberando la imputación" })).toBeTruthy();
      expect(confirm.getByRole("button", { name: "Volver" })).toHaveProperty("disabled", true);

      slow.resolve(payment());
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(releaseAllocation).toHaveBeenCalledTimes(1);
      expect(releaseAllocation.mock.calls[0][0]).toBe(5);
    });

    it("al liberar vuelve a pedir el cobro y el listado", async () => {
      const dialog = await open();
      const before = { detail: getPayment.mock.calls.length, list: listPayments.mock.calls.length };

      await userEvent.click(await dialog.findByRole("button", { name: "Liberar imputación a Factura C 0001-00000007" }));
      await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sí, liberar" }));

      await waitFor(() => expect(getPayment.mock.calls.length).toBeGreaterThan(before.detail));
      expect(listPayments.mock.calls.length).toBeGreaterThan(before.list);
    });

    it("'Volver' no libera nada", async () => {
      const dialog = await open();

      await userEvent.click(await dialog.findByRole("button", { name: "Liberar imputación a Factura C 0001-00000007" }));
      await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Volver" }));

      expect(releaseAllocation).not.toHaveBeenCalled();
    });

    it("si el servidor lo rechaza muestra el motivo", async () => {
      releaseAllocation.mockRejectedValue(new ApiError("La imputación ya estaba liberada.", 409, "RECEIVABLES_ALLOCATION_RELEASED"));
      const dialog = await open();

      await userEvent.click(await dialog.findByRole("button", { name: "Liberar imputación a Factura C 0001-00000007" }));
      await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sí, liberar" }));

      expect(await dialog.findByText("La imputación ya estaba liberada.")).toBeTruthy();
    });
  });

  describe("anular el cobro", () => {
    const startVoid = async (dialog: ReturnType<typeof within>) => {
      await userEvent.click(await dialog.findByRole("button", { name: "Anular cobro" }));
      return dialog.getByLabelText("Motivo de la anulación");
    };

    it("advierte que libera las imputaciones y exige un motivo de al menos 3 caracteres", async () => {
      const dialog = await open();
      const reason = await startVoid(dialog);

      expect(dialog.getByText(/se liberan sus imputaciones y deja de contar/)).toBeTruthy();
      const confirm = dialog.getAllByRole("button", { name: "Anular cobro" }).at(-1) as HTMLElement;
      expect(confirm).toHaveProperty("disabled", true);
      await userEvent.type(reason, "ab ");
      expect(confirm).toHaveProperty("disabled", true);
      await userEvent.type(reason, "c");
      expect(confirm).toHaveProperty("disabled", false);
    });

    it("anula con el motivo recortado, una sola vez aunque se haga doble click, y recarga", async () => {
      const slow = deferred<Payment>();
      voidPayment.mockReturnValue(slow.promise);
      const dialog = await open();
      await userEvent.type(await startVoid(dialog), "  Se cargó dos veces ");
      const confirm = () => dialog.getAllByRole("button", { name: /Anular cobro/ }).at(-1) as HTMLElement;

      await userEvent.click(confirm());
      await userEvent.dblClick(confirm());

      expect(dialog.getByRole("status", { name: "Anulando el cobro" })).toBeTruthy();
      slow.resolve(payment({ status: "voided" }));
      await waitFor(() => expect(screen.queryByRole("status", { name: "Anulando el cobro" })).toBeNull());
      expect(voidPayment).toHaveBeenCalledTimes(1);
      expect(voidPayment).toHaveBeenCalledWith(1, "Se cargó dos veces");
    });

    it("'Volver' descarta el motivo y no anula", async () => {
      const dialog = await open();
      await userEvent.type(await startVoid(dialog), "Error");

      await userEvent.click(dialog.getByRole("button", { name: "Volver" }));

      expect(dialog.queryByLabelText("Motivo de la anulación")).toBeNull();
      expect(voidPayment).not.toHaveBeenCalled();
      expect(dialog.getByRole("button", { name: "Anular cobro" })).toBeTruthy();
    });

    it("si el servidor lo rechaza muestra el motivo y conserva lo escrito", async () => {
      voidPayment.mockRejectedValue(new ApiError("El cobro ya estaba anulado.", 409, "RECEIVABLES_PAYMENT_VOIDED"));
      const dialog = await open();
      const reason = await startVoid(dialog);
      await userEvent.type(reason, "Error de carga");

      await userEvent.click(dialog.getAllByRole("button", { name: "Anular cobro" }).at(-1) as HTMLElement);

      expect(await dialog.findByText("El cobro ya estaba anulado.")).toBeTruthy();
      expect(reason).toHaveProperty("value", "Error de carga");
    });
  });

  it("un cobro anulado muestra el motivo y no ofrece anular, imputar ni liberar", async () => {
    const dialog = await open(payment({
      status: "voided", available: "0.00", voided_at: "2026-11-19T12:00:00-03:00", void_reason: "Se cargó dos veces",
      allocations: [allocation({ effective: false, released_at: "2026-11-19T12:00:00-03:00", release_reason: "Cobro anulado" })],
    }));

    expect(await dialog.findByText(/Cobro anulado el 19\/11\/2026: Se cargó dos veces/)).toBeTruthy();
    expect(dialog.queryByRole("button", { name: "Anular cobro" })).toBeNull();
    expect(dialog.queryByRole("button", { name: "Imputar" })).toBeNull();
    expect(dialog.queryByRole("button", { name: /^Liberar imputación/ })).toBeNull();
    expect(dialog.getByText("Liberada")).toBeTruthy();
  });

  it("Imputar desde el detalle cierra el detalle y abre la imputación", async () => {
    const dialog = await open();

    await userEvent.click(await dialog.findByRole("button", { name: "Imputar" }));

    expect(await screen.findByText("Imputar cobro")).toBeTruthy();
    expect(screen.queryByText("Cobro #1")).toBeNull();
  });

  it("sin cobro disponible no ofrece Imputar", async () => {
    const dialog = await open(payment({ available: "0.00", allocated: "1000.00", allocations: [allocation()] }));

    await dialog.findByText("Factura C 0001-00000007");
    expect(dialog.queryByRole("button", { name: "Imputar" })).toBeNull();
    expect(dialog.getByRole("button", { name: "Anular cobro" })).toBeTruthy();
  });

  describe("permisos", () => {
    it("quien solo puede imputar no ve Anular cobro", async () => {
      signOut();
      as(P.paymentView, P.paymentAllocate);
      const dialog = await open();

      await dialog.findByText("Factura C 0001-00000007");
      expect(dialog.queryByRole("button", { name: "Anular cobro" })).toBeNull();
      expect(dialog.getByRole("button", { name: "Imputar" })).toBeTruthy();
      expect(dialog.getByRole("button", { name: /^Liberar imputación/ })).toBeTruthy();
    });

    it("quien solo puede registrar y anular no ve Imputar ni Liberar", async () => {
      signOut();
      as(P.paymentView, P.paymentManage);
      const dialog = await open();

      await dialog.findByText("Factura C 0001-00000007");
      expect(dialog.getByRole("button", { name: "Anular cobro" })).toBeTruthy();
      expect(dialog.queryByRole("button", { name: "Imputar" })).toBeNull();
      expect(dialog.queryByRole("button", { name: /^Liberar imputación/ })).toBeNull();
    });

    it("quien solo puede ver no tiene ninguna acción", async () => {
      signOut();
      as(P.paymentView);
      const dialog = await open();

      await dialog.findByText("Factura C 0001-00000007");
      expect(dialog.queryByRole("button", { name: "Anular cobro" })).toBeNull();
      expect(dialog.queryByRole("button", { name: "Imputar" })).toBeNull();
      expect(dialog.queryByRole("button", { name: /^Liberar imputación/ })).toBeNull();
      expect(dialog.getByRole("button", { name: "Cerrar" })).toBeTruthy();
    });
  });

  it("si no se puede cargar el cobro lo informa", async () => {
    listPayments.mockResolvedValue(page([payment()]));
    getPayment.mockRejectedValue(new Error("No se pudo cargar el cobro"));
    render(<MemoryRouter><PaymentsPanel openingDate="2026-11-10" /></MemoryRouter>);

    await userEvent.click(await screen.findByRole("button", { name: "Ver cobro 1" }));

    expect(await screen.findByText("No se pudo cargar el cobro")).toBeTruthy();
  });
});
