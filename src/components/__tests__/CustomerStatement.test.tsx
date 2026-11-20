import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../services/apiClient";
import type { CustomerBalance, Statement, StatementLine } from "../../types/statement";
import CustomerStatement from "../receivables/CustomerStatement";

const getAccountStatement = vi.fn();
const getCustomerBalance = vi.fn();

vi.mock("../../services/receivablesService", () => ({
  getAccountStatement: (...a: unknown[]) => getAccountStatement(...a),
  getCustomerBalance: (...a: unknown[]) => getCustomerBalance(...a),
}));

const line = (over: Partial<StatementLine>): StatementLine => ({
  date: "2026-11-10", kind: "invoice", source_id: 1, concept: "Factura C 0001-00000001", debit: "1000.00", credit: "0.00", balance: "1000.00", note: null, ...over,
});

const statement = (over: Partial<Statement> = {}): Statement => ({
  customer: { id: 5, name: "Acme SA" }, from: null, to: null, opening_balance: "0.00", debit: "1500.00", credit: "700.00", closing_balance: "800.00",
  lines: [
    line({}),
    line({ date: "2026-11-12", kind: "payment", source_id: 3, concept: "Cobro #3 (Transferencia)", debit: "0.00", credit: "700.00", balance: "300.00" }),
    line({ date: "2026-11-15", kind: "invoice", source_id: 2, concept: "Factura C 0001-00000002", debit: "500.00", credit: "0.00", balance: "800.00", note: "Vence 30/11/2026" }),
  ],
  meta: { total: 3, page: 1, per_page: 50, last_page: 1 }, ...over,
});

const balance = (over: Partial<CustomerBalance> = {}): CustomerBalance => ({
  customer_id: 5, debit: "1500.00", credit: "700.00", balance: "800.00", pending: "800.00", available_credit: "0.00", status: "debtor", ...over,
});

const renderScreen = (path = "/dashboard/receivables/customer/5") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/dashboard/receivables/customer/:id" element={<CustomerStatement />} /></Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  getAccountStatement.mockResolvedValue(statement());
  getCustomerBalance.mockResolvedValue(balance());
});
afterEach(() => vi.clearAllMocks());

describe("Estado de cuenta del cliente", () => {
  it("muestra el cliente, los tres saldos y cada movimiento con su saldo acumulado", async () => {
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Acme SA" })).toBeTruthy();
    const stats = within(screen.getByLabelText("Saldos del cliente"));
    expect(stats.getByText("El cliente debe")).toBeTruthy();
    expect(stats.getByText("Pendiente de facturas")).toBeTruthy();
    expect(stats.getByText("Cobros a favor sin imputar")).toBeTruthy();

    const rows = screen.getAllByRole("row");
    const text = rows.map((r) => r.textContent ?? "");
    expect(text.some((t) => t.includes("Factura C 0001-00000001") && t.includes("1.000,00"))).toBe(true);
    // Cobro: va en el Haber y deja el saldo en 300
    const payment = rows.find((r) => r.textContent?.includes("Cobro #3"))!;
    expect(payment.textContent).toContain("700,00");
    expect(payment.textContent).toContain("300,00");
    expect(screen.getByText("Vence 30/11/2026")).toBeTruthy();
    // Totales del pie
    const footer = rows.at(-1)!;
    expect(footer.textContent).toContain("Totales");
    expect(footer.textContent).toContain("800,00");
  });

  it("pide el estado de cuenta del cliente de la dirección", async () => {
    renderScreen();
    await screen.findByRole("heading", { name: "Acme SA" });

    expect(getAccountStatement).toHaveBeenCalledWith(5, { from: "", to: "", page: 1, perPage: 50 }, expect.anything());
    expect(getCustomerBalance).toHaveBeenCalledWith(5, expect.anything());
  });

  it("una cuenta a favor del cliente se muestra como tal", async () => {
    getCustomerBalance.mockResolvedValue(balance({ balance: "-250.00", pending: "0.00", available_credit: "250.00", status: "creditor" }));
    renderScreen();

    expect(await screen.findByText("Saldo a favor del cliente")).toBeTruthy();
  });

  it("el cobro anulado se distingue como tal", async () => {
    getAccountStatement.mockResolvedValue(statement({
      lines: [line({ kind: "payment_void", source_id: 3, concept: "Anulación del cobro #3", debit: "700.00", credit: "0.00", balance: "700.00" })],
    }));
    renderScreen();

    expect(await screen.findByText("Cobro anulado")).toBeTruthy();
    expect(screen.getByText("Anulación del cobro #3")).toBeTruthy();
  });

  it("un cliente sin movimientos lo dice", async () => {
    getAccountStatement.mockResolvedValue(statement({ lines: [], debit: "0.00", credit: "0.00", closing_balance: "0.00", meta: { total: 0, page: 1, per_page: 50, last_page: 1 } }));
    renderScreen();

    expect(await screen.findByText("Este cliente todavía no tiene movimientos en la cuenta corriente.")).toBeTruthy();
  });

  it("filtrar por período vuelve a pedir y muestra el saldo anterior", async () => {
    renderScreen();
    await screen.findByRole("heading", { name: "Acme SA" });
    getAccountStatement.mockResolvedValue(statement({ from: "2026-11-12", opening_balance: "1000.00", lines: [line({ date: "2026-11-12", kind: "payment", source_id: 3, concept: "Cobro #3 (Transferencia)", debit: "0.00", credit: "700.00", balance: "300.00" })] }));

    await userEvent.type(document.querySelector<HTMLInputElement>("input[name=statement_from]")!, "12112026");

    await waitFor(() => expect(getAccountStatement).toHaveBeenLastCalledWith(5, { from: "2026-11-12", to: "", page: 1, perPage: 50 }, expect.anything()));
    expect(await screen.findByText("Saldo anterior al período")).toBeTruthy();
    expect(screen.getByText("Total del período")).toBeTruthy();
  });

  it("si la apertura no está confirmada muestra el motivo que da el servidor", async () => {
    const motivo = "Primero confirmá la apertura de la cuenta corriente.";
    getAccountStatement.mockRejectedValue(new ApiError(motivo, 422, "RECEIVABLES_OPENING_REQUIRED"));
    getCustomerBalance.mockRejectedValue(new ApiError(motivo, 422, "RECEIVABLES_OPENING_REQUIRED"));
    renderScreen();

    expect((await screen.findAllByText(motivo)).length).toBeGreaterThan(0);
  });

  it("un id inválido no consulta nada", async () => {
    renderScreen("/dashboard/receivables/customer/abc");

    expect(await screen.findByText("El cliente no existe.")).toBeTruthy();
    expect(getAccountStatement).not.toHaveBeenCalled();
  });
});
