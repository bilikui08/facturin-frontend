import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../services/apiClient";
import { signIn, signOut } from "../../test/session";
import { allocation, payment } from "../../test/payments";
import { P } from "../../config/permissions";
import type { CustomerBalance, Statement, StatementLine } from "../../types/statement";
import CustomerStatement from "../receivables/CustomerStatement";

const getAccountStatement = vi.fn();
const getCustomerBalance = vi.fn();
const getPayment = vi.fn();

vi.mock("../../services/receivablesService", () => ({
  getAccountStatement: (...a: unknown[]) => getAccountStatement(...a),
  getCustomerBalance: (...a: unknown[]) => getCustomerBalance(...a),
}));

vi.mock("../../services/paymentsService", () => ({
  getPayment: (...a: unknown[]) => getPayment(...a),
  voidPayment: vi.fn(),
  releaseAllocation: vi.fn(),
  allocatePayment: vi.fn(),
  getAllocationSuggestion: vi.fn(),
}));

const line = (over: Partial<StatementLine>): StatementLine => ({
  date: "2026-11-10", kind: "invoice", source_id: 1, concept: "Factura C 0001-00000001", debit: "1000.00", credit: "0.00", balance: "1000.00", note: null,
  pending: null, item_status: null, allocations: [], imputed_to: [], available: null, ...over,
});

const statement = (over: Partial<Statement> = {}): Statement => ({
  customer: { id: 5, name: "Acme SA" }, from: null, to: null, opening_balance: "0.00", debit: "1500.00", credit: "700.00", closing_balance: "800.00",
  lines: [
    line({}),
    line({ date: "2026-11-12", kind: "payment", source_id: 3, concept: "Cobro #3 (Transferencia)", debit: "0.00", credit: "700.00", balance: "300.00" }),
    line({ date: "2026-11-15", kind: "invoice", source_id: 2, concept: "Factura C 0001-00000002", debit: "500.00", credit: "0.00", balance: "800.00", note: "Vence 30/11/2026" }),
  ],
  previous_history: [],
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
afterEach(() => { vi.clearAllMocks(); signOut(); });

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

  it("la factura dice cuánto le falta y muestra con sangría los cobros imputados, sin sumarlos como movimientos", async () => {
    getAccountStatement.mockResolvedValue(statement({
      lines: [
        line({ pending: "89000.00", item_status: "partial", debit: "90000.00", balance: "90000.00", allocations: [
          { id: 1, payment_id: 7, payment_label: "Cobro #7 · Transferencia (REF001)", amount: "500.00", effective: true, released_at: null },
          { id: 2, payment_id: 8, payment_label: "Cobro #8 · Transferencia (REF002)", amount: "500.00", effective: true, released_at: null },
        ] }),
        line({ kind: "payment", source_id: 7, concept: "Cobro #7 · Transferencia", note: "Referencia: REF001", debit: "0.00", credit: "500.00", balance: "89500.00", imputed_to: [{ id: 1, target_label: "Factura C 0001-00000001", amount: "500.00", effective: true, released_at: null }], available: "0.00" }),
      ],
    }));
    renderScreen();

    expect(await screen.findByText("Pendiente $ 89.000,00")).toBeTruthy();
    const subRows = screen.getAllByTestId("allocation-row");
    expect(subRows).toHaveLength(2);
    expect(subRows[0].textContent).toContain("Cobro #7 · Transferencia (REF001)");
    expect(subRows[0].textContent).toContain("500,00 imputado");
    // El cobro dice a qué factura pagó
    expect(screen.getByText("Aplicado a Factura C 0001-00000001 ($ 500,00)")).toBeTruthy();
    // Las filas con sangría no traen saldo propio: solo las dos líneas reales
    expect(screen.getAllByText(/\$\s*90\.000,00/).length).toBeGreaterThan(0);
  });

  it("un anticipo sin imputar, una imputación sin efecto y una factura cancelada se distinguen", async () => {
    getAccountStatement.mockResolvedValue(statement({
      lines: [
        line({ pending: "0.00", item_status: "paid", allocations: [{ id: 3, payment_id: 9, payment_label: "Cobro #9 · Efectivo", amount: "1000.00", effective: false, released_at: "2026-11-21T10:00:00-03:00" }] }),
        line({ kind: "payment", source_id: 4, concept: "Cobro #4 · Efectivo", debit: "0.00", credit: "300.00", balance: "700.00", imputed_to: [], available: "300.00" }),
      ],
    }));
    renderScreen();

    expect(await screen.findByText("Pagada")).toBeTruthy();
    expect(screen.getByText("Sin imputar $ 300,00 (anticipo)")).toBeTruthy();
    expect(screen.getByTestId("allocation-row").textContent).toContain("liberada o cobro anulado");
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
  const withAllocations = () => getAccountStatement.mockResolvedValue(statement({
    lines: [
      line({ pending: "89000.00", item_status: "partial", debit: "90000.00", balance: "90000.00", allocations: [
        { id: 1, payment_id: 7, payment_label: "Cobro #7 · Transferencia (REF001)", amount: "500.00", effective: true, released_at: null },
        { id: 2, payment_id: 8, payment_label: "Cobro #8 · Transferencia (REF002)", amount: "300.00", effective: true, released_at: null },
        { id: 3, payment_id: 9, payment_label: "Cobro #9 · Efectivo", amount: "999.00", effective: false, released_at: "2026-11-21T10:00:00-03:00" },
      ] }),
    ],
  }));

  it("las imputaciones tienen un encabezado con la cantidad y el total aplicado (sin contar las que no tienen efecto)", async () => {
    withAllocations();
    renderScreen();

    const header = await screen.findByTestId("allocations-header");
    expect(header.textContent).toContain("Imputaciones (3)");
    expect(header.textContent).toMatch(/Total aplicado: \$\s800,00/);
  });

  it("el encabezado contrae y vuelve a mostrar las imputaciones", async () => {
    withAllocations();
    renderScreen();

    const toggle = await screen.findByRole("button", { name: /Imputaciones de/ });
    expect(screen.getAllByTestId("allocation-row")).toHaveLength(3);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    await userEvent.click(toggle);
    expect(screen.queryAllByTestId("allocation-row")).toHaveLength(0);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await userEvent.click(toggle);
    expect(screen.getAllByTestId("allocation-row")).toHaveLength(3);
  });

  it("el estado de la factura es Pendiente, Pago parcial o Pagada, sin cambiar los importes", async () => {
    getAccountStatement.mockResolvedValue(statement({
      lines: [
        line({ source_id: 1, concept: "Factura A", pending: "500.00", item_status: "pending" }),
        line({ source_id: 2, concept: "Factura B", pending: "200.00", item_status: "partial" }),
        line({ source_id: 3, concept: "Factura C", pending: "0.00", item_status: "paid" }),
      ],
    }));
    renderScreen();

    await screen.findByText("Factura A");
    const row = (name: string) => screen.getByText(name).closest("tr")!.textContent ?? "";
    expect(row("Factura A")).toContain("Pendiente");
    expect(row("Factura A")).not.toContain("Pago parcial");
    expect(row("Factura B")).toContain("Pago parcial");
    expect(row("Factura B")).toMatch(/Pendiente \$\s200,00/);
    expect(row("Factura C")).toContain("Pagada");
    expect(row("Factura C")).not.toContain("Pendiente $");
  });

  it("al hacer clic en un cobro (en su fila o bajo la factura) se abre su detalle", async () => {
    signIn({ organizationId: 1, permissions: [P.paymentView] });
    getPayment.mockResolvedValue(payment({ id: 7, amount: "500.00", allocated: "500.00", available: "0.00", reference: "REF001", allocations: [allocation({ payment_id: 7, target_label: "Factura C 0001-00000001", amount: "500.00" })] }));
    withAllocations();
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: "Cobro #7 · Transferencia (REF001)" }));

    expect(getPayment).toHaveBeenCalledWith(7, expect.anything());
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("un cobro dice su número y la referencia aparte, y a qué factura se aplicó", async () => {
    getAccountStatement.mockResolvedValue(statement({
      lines: [line({ kind: "payment", source_id: 7, concept: "Cobro #7 · Transferencia", note: "Referencia: REF001", debit: "0.00", credit: "500.00", balance: "-500.00",
        imputed_to: [
          { id: 1, target_label: "Factura C 0001-00000001", amount: "300.00", effective: true, released_at: null },
          { id: 2, target_label: "Factura C 0001-00000002", amount: "200.00", effective: true, released_at: null },
        ], available: "0.00" })],
    }));
    renderScreen();

    expect(await screen.findByRole("button", { name: "Ver Cobro #7 · Transferencia" })).toBeTruthy();
    expect(screen.getByText("Referencia: REF001")).toBeTruthy();
    expect(screen.getByText("Aplicado a Factura C 0001-00000001 ($ 300,00)")).toBeTruthy();
    expect(screen.getByText("Aplicado a Factura C 0001-00000002 ($ 200,00)")).toBeTruthy();
  });
  it("el historial anterior a la apertura es un bloque aparte, informativo, y no cambia los totales", async () => {
    getAccountStatement.mockResolvedValue(statement({
      previous_history: [{
        invoice: { id: 1, label: "Factura C 0001-00000072", date: "2026-11-18", total: "25495.87" },
        credit_note: { id: 7, label: "Nota de Crédito C 0001-00000002", date: "2026-11-18", total: "25495.87" },
        status: "compensated",
      }],
    }));
    renderScreen();

    const block = await screen.findByLabelText("Historial anterior a la apertura");
    expect(block.textContent).toContain("Solo informativo");
    expect(block.textContent).toContain("No es un historial completo");
    const row = within(block).getByTestId("history-row");
    expect(row.textContent).toContain("Factura C 0001-00000072");
    expect(row.textContent).toContain("Nota de Crédito C 0001-00000002");
    expect(row.textContent).toContain("Compensada");
    expect(row.textContent).toMatch(/25\.495,87/);
    // El libro y sus totales siguen igual: el pie dice lo mismo que sin historial
    const footer = screen.getAllByRole("row").find((r) => r.textContent?.startsWith("Totales"))!;
    expect(footer.textContent).toContain("800,00");
    expect(footer.textContent).not.toContain("25.495,87");
    // Sin botones de imputar ni de cobro en ese bloque
    expect(within(block).queryAllByRole("button")).toHaveLength(0);
  });

  it("sin historial anterior no se muestra el bloque", async () => {
    renderScreen();
    await screen.findByRole("heading", { name: "Acme SA" });

    expect(screen.queryByLabelText("Historial anterior a la apertura")).toBeNull();
  });
});
