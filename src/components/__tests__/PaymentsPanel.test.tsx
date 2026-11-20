import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "../../config/permissions";
import { ApiError } from "../../services/apiClient";
import { signIn, signOut } from "../../test/session";
import { allocation, deferred, line, page, payment, suggestion } from "../../test/payments";
import type { Payment } from "../../types/payments";
import { todayInArgentina } from "../../utils/dates";
import PaymentsPanel from "../receivables/PaymentsPanel";

const listPayments = vi.fn();
const getPayment = vi.fn();
const registerPayment = vi.fn();
const voidPayment = vi.fn();
const allocatePayment = vi.fn();
const releaseAllocation = vi.fn();
const getAllocationSuggestion = vi.fn();
const getResources = vi.fn();

vi.mock("../../services/paymentsService", () => ({
  listPayments: (...a: unknown[]) => listPayments(...a),
  getPayment: (...a: unknown[]) => getPayment(...a),
  registerPayment: (...a: unknown[]) => registerPayment(...a),
  voidPayment: (...a: unknown[]) => voidPayment(...a),
  allocatePayment: (...a: unknown[]) => allocatePayment(...a),
  releaseAllocation: (...a: unknown[]) => releaseAllocation(...a),
  getAllocationSuggestion: (...a: unknown[]) => getAllocationSuggestion(...a),
}));
vi.mock("../../services/crudService", () => ({ getResources: (...a: unknown[]) => getResources(...a) }));

const OPENING = "2026-11-10";
const renderPanel = () => render(<MemoryRouter><PaymentsPanel openingDate={OPENING} /></MemoryRouter>);
const as = (...permissions: string[]) => signIn({ organizationId: 1, permissions });
const ALL = [P.paymentView, P.paymentManage, P.paymentAllocate, P.customerView];

const asDigits = (iso: string) => iso.split("-").reverse().join("");
const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** El selector de clientes existe antes de que lleguen sus opciones: se espera a que estén cargadas */
const pick = async (label: string | RegExp, value: string, option = "Acme SA", scope: { findByLabelText: typeof screen.findByLabelText; findByRole: typeof screen.findByRole } = screen) => {
  const select = await scope.findByLabelText(label);
  await scope.findByRole("option", { name: option });
  await userEvent.selectOptions(select, value);
};

const fillForm = async ({ amount = "1.500,75", customer = "10" }: { amount?: string; customer?: string } = {}) => {
  const dialog = within(await screen.findByRole("dialog"));
  await pick("Cliente", customer, "Acme SA", dialog);
  await userEvent.type(dialog.getByLabelText("Importe"), amount);
  return dialog;
};

beforeEach(() => {
  as(...ALL);
  listPayments.mockReset().mockResolvedValue(page([payment()]));
  getPayment.mockReset().mockResolvedValue(payment({ allocations: [] }));
  registerPayment.mockReset().mockResolvedValue(payment({ id: 9, amount: "1500.75", available: "1500.75" }));
  voidPayment.mockReset();
  allocatePayment.mockReset().mockResolvedValue(payment({ id: 9, allocated: "400.00", available: "1100.75" }));
  releaseAllocation.mockReset();
  getAllocationSuggestion.mockReset().mockResolvedValue(suggestion([]));
  getResources.mockReset().mockResolvedValue([{ id: 10, name: "Acme SA" }, { id: 11, name: "Beta SRL" }]);
});

afterEach(() => signOut());

describe("Cobros: listado", () => {
  it("muestra cada cobro con cliente, fecha, medio, referencia, importe, disponible y estado", async () => {
    listPayments.mockResolvedValue(page([
      payment(),
      payment({ id: 2, customer_name: "Beta SRL", method: "cash", reference: null, amount: "250.00", available: "0.00", allocated: "250.00" }),
      payment({ id: 3, status: "voided", amount: "80.00", available: "0.00" }),
    ]));
    renderPanel();

    const table = within(await screen.findByRole("table"));
    expect(table.getAllByText("Acme SA", { selector: "a" })).toHaveLength(2);
    expect(table.getByText("Beta SRL", { selector: "a" })).toBeTruthy();
    expect(table.getByText((_, el) => el?.tagName === "P" && el.textContent === "18/11/2026 · Transferencia · TRX-1 · #1")).toBeTruthy();
    expect(table.getByText(/Disponible .*1\.000,00/)).toBeTruthy();
    expect(table.getByText("Con saldo a imputar")).toBeTruthy();
    expect(table.getByText("Imputado")).toBeTruthy();
    expect(table.getByText("Anulado")).toBeTruthy();
    expect(table.getByText(/Efectivo/)).toBeTruthy();
  });

  it("Imputar solo aparece en cobros confirmados con saldo disponible", async () => {
    listPayments.mockResolvedValue(page([
      payment(),
      payment({ id: 2, available: "0.00", allocated: "1000.00" }),
      payment({ id: 3, status: "voided", available: "0.00" }),
    ]));
    renderPanel();

    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: "Imputar cobro 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Imputar cobro 2" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Imputar cobro 3" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Ver cobro/ })).toHaveLength(3);
  });

  it("sin cobros lo explica; con filtros dice que no hay con esos filtros", async () => {
    listPayments.mockResolvedValue(page([]));
    renderPanel();
    expect(await screen.findByText("Todavía no se registró ningún cobro.")).toBeTruthy();

    await pick("Estado", "voided", "Anulados");
    expect(await screen.findByText("No hay cobros con esos filtros.")).toBeTruthy();
  });

  it("pide la primera página de 20 sin filtros y los aplica al cambiarlos, volviendo a la página 1", async () => {
    listPayments.mockResolvedValue(page([payment()], { total: 45, last_page: 3 }));
    renderPanel();
    await screen.findByRole("table");
    expect(listPayments.mock.calls[0][0]).toEqual({ customerId: "", status: "", dateFrom: "", dateTo: "", page: 1, perPage: 20 });

    await userEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(listPayments.mock.lastCall?.[0].page).toBe(2));

    await pick("Cliente", "11", "Beta SRL");
    await waitFor(() => expect(listPayments.mock.lastCall?.[0]).toMatchObject({ customerId: "11", page: 1 }));

    await userEvent.selectOptions(screen.getByLabelText("Estado"), "confirmed");
    await waitFor(() => expect(listPayments.mock.lastCall?.[0]).toMatchObject({ status: "confirmed", customerId: "11", page: 1 }));
  });

  it("pagina: muestra el total y deshabilita anterior/siguiente en los extremos", async () => {
    listPayments.mockResolvedValue(page([payment()], { total: 45, last_page: 3 }));
    renderPanel();

    await screen.findByText("45 cobros");
    expect(screen.getByRole("button", { name: "Página anterior" })).toHaveProperty("disabled", true);
    expect(screen.getByText("1 / 3")).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("Por página"), "50");
    await waitFor(() => expect(listPayments.mock.lastCall?.[0]).toMatchObject({ perPage: 50, page: 1 }));
  });

  it("filtra por fechas desde y hasta", async () => {
    renderPanel();
    await screen.findByRole("table");
    const inputs = screen.getAllByPlaceholderText("dd/mm/aaaa");

    await userEvent.type(inputs[0], "01112026");
    await waitFor(() => expect(listPayments.mock.lastCall?.[0]).toMatchObject({ dateFrom: "2026-11-01" }));
    await userEvent.type(inputs[1], "30112026");
    await waitFor(() => expect(listPayments.mock.lastCall?.[0]).toMatchObject({ dateFrom: "2026-11-01", dateTo: "2026-11-30" }));
  });

  it("si falla la carga muestra el error", async () => {
    listPayments.mockRejectedValue(new Error("Sin conexión con el servidor"));
    renderPanel();

    expect(await screen.findByText("Sin conexión con el servidor")).toBeTruthy();
  });

  it("sin permiso de registrar no hay botón de alta; sin permiso de imputar no hay Imputar", async () => {
    signOut();
    as(P.paymentView);
    renderPanel();

    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: "Registrar cobro" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Imputar cobro/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Ver cobro 1" })).toBeTruthy();
  });

  it("sin permiso para ver clientes no los pide: el listado funciona igual, sin filtro por cliente", async () => {
    signOut();
    as(P.paymentView, P.paymentManage, P.paymentAllocate);
    renderPanel();

    await screen.findByRole("table");
    expect(getResources).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Cliente")).toBeNull();
    expect(screen.getByLabelText("Estado")).toBeTruthy();

    // Y al querer registrar un cobro se explica por qué no se puede elegir cliente
    await userEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
    expect(await screen.findByText(/necesitás poder ver los clientes/)).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Registrar cobro" })).toHaveProperty("disabled", true);
  });

  it("con alguno de los permisos que habilitan GET /customers sí los pide (ver, administrar o emitir)", async () => {
    for (const permission of [P.customerView, P.customerManage, P.invoiceIssue]) {
      getResources.mockClear();
      signOut();
      as(P.paymentView, permission);
      const { unmount } = renderPanel();

      await screen.findByRole("table");
      await waitFor(() => expect(getResources).toHaveBeenCalledTimes(1));
      unmount();
    }
  });

  it("si la lista de clientes no carga, el listado sigue y el formulario muestra el error", async () => {
    getResources.mockRejectedValue(new ApiError("Sin conexión con el servidor", 500));
    renderPanel();

    await screen.findByRole("table");
    expect(screen.queryByLabelText("Cliente")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
    expect(await within(screen.getByRole("dialog")).findByText("Sin conexión con el servidor")).toBeTruthy();
  });
});

describe("Cobros: registrar", () => {
  const open = async () => {
    renderPanel();
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
  };

  it("manda el cobro con el importe normalizado, la fecha en ISO y la clave de idempotencia", async () => {
    await open();
    const dialog = await fillForm();
    await userEvent.selectOptions(dialog.getByLabelText("Medio de pago"), "cash");
    await userEvent.type(dialog.getByLabelText("Referencia (opcional)"), "  Recibo 12 ");
    await userEvent.type(dialog.getByLabelText("Notas (opcional)"), "En mano");
    expect(dialog.getByText(/Se registrará .*1\.500,75/)).toBeTruthy();

    await userEvent.click(dialog.getByRole("button", { name: "Registrar cobro" }));

    await waitFor(() => expect(registerPayment).toHaveBeenCalledTimes(1));
    const [body, key] = registerPayment.mock.calls[0];
    expect(body).toEqual({ customer_id: 10, amount: "1500.75", payment_date: todayInArgentina(), method: "cash", reference: "Recibo 12", notes: "En mano" });
    expect(key).toMatch(/^[A-Za-z0-9._:-]{8,64}$/);
  });

  it("no deja registrar sin cliente, sin importe válido o con una fecha futura o anterior a la apertura", async () => {
    await open();
    const dialog = within(await screen.findByRole("dialog"));
    const submit = dialog.getByRole("button", { name: "Registrar cobro" });
    expect(submit).toHaveProperty("disabled", true);

    await pick("Cliente", "10", "Acme SA", dialog);
    expect(submit).toHaveProperty("disabled", true);                          // falta el importe

    await userEvent.type(dialog.getByLabelText("Importe"), "0.123");
    await userEvent.tab();
    expect(dialog.getByText("Importe no válido. Ej.: 1500,75")).toBeTruthy();
    expect(submit).toHaveProperty("disabled", true);

    await userEvent.clear(dialog.getByLabelText("Importe"));
    await userEvent.type(dialog.getByLabelText("Importe"), "100");
    expect(submit).toHaveProperty("disabled", false);

    const date = dialog.getByLabelText("Fecha del cobro");
    await userEvent.clear(date);
    await userEvent.type(date, asDigits(addDays(todayInArgentina(), 1)));
    expect(dialog.getByText("La fecha no puede ser futura.")).toBeTruthy();
    expect(submit).toHaveProperty("disabled", true);

    await userEvent.clear(date);
    await userEvent.type(date, asDigits(addDays(OPENING, -1)));
    expect(dialog.getByText(/No puede ser anterior a la apertura \(10\/11\/2026\)/)).toBeTruthy();
    expect(submit).toHaveProperty("disabled", true);

    await userEvent.clear(date);
    await userEvent.type(date, asDigits(OPENING));                            // el día de la apertura sí
    expect(submit).toHaveProperty("disabled", false);
  });

  it("con importe y fecha válidos pero SIN cliente no deja registrar", async () => {
    await open();
    const dialog = within(await screen.findByRole("dialog"));

    await userEvent.type(dialog.getByLabelText("Importe"), "100");
    expect(dialog.getByRole("button", { name: "Registrar cobro" })).toHaveProperty("disabled", true);

    await pick("Cliente", "10", "Acme SA", dialog);
    expect(dialog.getByRole("button", { name: "Registrar cobro" })).toHaveProperty("disabled", false);
  });

  it("al registrarlo se cierra, avisa, recarga el listado y abre la imputación del cobro nuevo", async () => {
    getAllocationSuggestion.mockResolvedValue(suggestion([line()]));
    await open();
    const dialog = await fillForm();
    await userEvent.click(dialog.getByRole("button", { name: "Registrar cobro" }));

    expect(await screen.findByText("Cobro #9 registrado.")).toBeTruthy();
    expect(await screen.findByText("Imputar cobro")).toBeTruthy();
    expect(getAllocationSuggestion.mock.calls[0][0]).toBe(10);
    expect(getAllocationSuggestion.mock.calls[0][1]).toMatchObject({ paymentId: 9 });
    expect(listPayments.mock.calls.length).toBeGreaterThan(1);
  });

  it("quien no puede imputar registra el cobro y queda como anticipo (no se abre la imputación)", async () => {
    signOut();
    as(P.paymentView, P.paymentManage, P.customerView);
    await open();
    const dialog = await fillForm();
    await userEvent.click(dialog.getByRole("button", { name: "Registrar cobro" }));

    expect(await screen.findByText("Cobro #9 registrado.")).toBeTruthy();
    expect(screen.queryByText("Imputar cobro")).toBeNull();
    expect(getAllocationSuggestion).not.toHaveBeenCalled();
  });

  it("un doble click lo manda una sola vez; mientras tanto el botón muestra el spinner y Cancelar queda deshabilitado", async () => {
    const slow = deferred<Payment>();
    registerPayment.mockReturnValue(slow.promise);
    await open();
    const dialog = await fillForm();

    await userEvent.click(dialog.getByRole("button", { name: "Registrar cobro" }));
    await userEvent.dblClick(dialog.getByRole("button", { name: /Registrar cobro/ }));

    expect(dialog.getByRole("status", { name: "Registrando el cobro" })).toBeTruthy();
    expect(dialog.getByRole("button", { name: "Cancelar" })).toHaveProperty("disabled", true);
    slow.resolve(payment({ id: 9 }));
    await waitFor(() => expect(screen.queryByRole("status", { name: "Registrando el cobro" })).toBeNull());
    expect(registerPayment).toHaveBeenCalledTimes(1);
  });

  it("si falla muestra el motivo dentro del diálogo y un reintento con los MISMOS datos usa la MISMA clave", async () => {
    registerPayment.mockRejectedValueOnce(new Error("Sin conexión con el servidor")).mockResolvedValue(payment({ id: 9 }));
    await open();
    const dialog = await fillForm();

    await userEvent.click(dialog.getByRole("button", { name: "Registrar cobro" }));
    expect(await dialog.findByText("Sin conexión con el servidor")).toBeTruthy();
    await userEvent.click(dialog.getByRole("button", { name: "Registrar cobro" }));

    await waitFor(() => expect(registerPayment).toHaveBeenCalledTimes(2));
    expect(registerPayment.mock.calls[1][1]).toBe(registerPayment.mock.calls[0][1]);
  });

  it("si la persona cambia los datos después de un fallo, es otro intento con otra clave", async () => {
    registerPayment.mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValue(payment({ id: 9 }));
    await open();
    const dialog = await fillForm({ amount: "100" });

    await userEvent.click(dialog.getByRole("button", { name: "Registrar cobro" }));
    await dialog.findByText("Sin conexión");
    await userEvent.type(dialog.getByLabelText("Importe"), "5");                // 1005
    await userEvent.click(dialog.getByRole("button", { name: "Registrar cobro" }));

    await waitFor(() => expect(registerPayment).toHaveBeenCalledTimes(2));
    expect(registerPayment.mock.calls[1][1]).not.toBe(registerPayment.mock.calls[0][1]);
    expect(registerPayment.mock.calls[1][0].amount).toBe("1005.00");
  });

  it("el cobro siguiente, aunque tenga los mismos datos, lleva otra clave", async () => {
    await open();
    let dialog = await fillForm({ amount: "100" });
    await userEvent.click(dialog.getByRole("button", { name: "Registrar cobro" }));
    await screen.findByText("Cobro #9 registrado.");
    await userEvent.click(await screen.findByRole("button", { name: "Dejar como anticipo" }));

    await userEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
    dialog = await fillForm({ amount: "100" });
    await userEvent.click(dialog.getByRole("button", { name: "Registrar cobro" }));

    await waitFor(() => expect(registerPayment).toHaveBeenCalledTimes(2));
    expect(registerPayment.mock.calls[1][1]).not.toBe(registerPayment.mock.calls[0][1]);
  });

  it("el formulario se arma de cero cada vez que se abre", async () => {
    await open();
    let dialog = await fillForm({ amount: "100" });
    await userEvent.click(dialog.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Registrar cobro" }));
    dialog = within(await screen.findByRole("dialog"));

    expect(dialog.getByLabelText("Importe")).toHaveProperty("value", "");
    expect(dialog.getByLabelText("Cliente")).toHaveProperty("value", "");
  });
});

describe("Cobros: imputar", () => {
  const fifo = () => suggestion([
    line({ id: 7, label: "Factura C 0001-00000007", pending: "400.00", suggested: "400.00" }),
    line({ id: 8, label: "Factura C 0001-00000008", pending: "600.00", suggested: "400.00", due_date: "2026-11-01", overdue: true }),
    line({ id: 9, label: "Factura C 0001-00000009", pending: "300.00", suggested: "0.00" }),
  ], { amount: "800.00" });

  const openAllocation = async (p: Payment = payment({ available: "800.00", amount: "800.00" })) => {
    listPayments.mockResolvedValue(page([p]));
    getAllocationSuggestion.mockResolvedValue(fifo());
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: `Imputar cobro ${p.id}` }));
    return within(await screen.findByRole("dialog"));
  };

  it("propone el reparto FIFO ya cargado, con lo pendiente, la marca de vencida y los totales", async () => {
    const dialog = await openAllocation();

    expect(await dialog.findByLabelText("Imputar a Factura C 0001-00000007")).toHaveProperty("value", "400.00");
    expect(dialog.getByLabelText("Imputar a Factura C 0001-00000008")).toHaveProperty("value", "400.00");
    expect(dialog.getByLabelText("Imputar a Factura C 0001-00000009")).toHaveProperty("value", "");
    expect(dialog.getByText("Vencida")).toBeTruthy();
    expect(dialog.getByText("Se imputa").nextSibling?.textContent).toMatch(/800,00/);
    expect(dialog.getByText("Queda como anticipo").nextSibling?.textContent).toMatch(/0,00/);
    expect(getAllocationSuggestion.mock.calls[0][1]).toMatchObject({ paymentId: 1, order: "issue_date" });
  });

  it("imputa solo las líneas con importe, normalizadas, con la clave de idempotencia", async () => {
    allocatePayment.mockResolvedValue(payment({ allocated: "800.00", available: "0.00" }));
    const dialog = await openAllocation();
    await dialog.findByLabelText("Imputar a Factura C 0001-00000007");

    await userEvent.click(dialog.getByRole("button", { name: "Imputar" }));

    await waitFor(() => expect(allocatePayment).toHaveBeenCalledTimes(1));
    const [id, lines, key] = allocatePayment.mock.calls[0];
    expect(id).toBe(1);
    expect(lines).toEqual([{ invoice_id: 7, amount: "400.00" }, { invoice_id: 8, amount: "400.00" }]);
    expect(key).toMatch(/^[A-Za-z0-9._:-]{8,64}$/);
    expect(await screen.findByText("Cobro #1 imputado.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("se puede corregir a mano: cambia los totales y lo que se manda", async () => {
    const dialog = await openAllocation();
    const second = await dialog.findByLabelText("Imputar a Factura C 0001-00000008");

    await userEvent.clear(second);
    await userEvent.type(second, "150,50");
    await userEvent.type(dialog.getByLabelText("Imputar a Factura C 0001-00000009"), "100");

    expect(dialog.getByText("Se imputa").nextSibling?.textContent).toMatch(/650,50/);
    expect(dialog.getByText("Queda como anticipo").nextSibling?.textContent).toMatch(/149,50/);
    await userEvent.click(dialog.getByRole("button", { name: "Imputar" }));
    await waitFor(() => expect(allocatePayment).toHaveBeenCalled());
    expect(allocatePayment.mock.calls[0][1]).toEqual([
      { invoice_id: 7, amount: "400.00" }, { invoice_id: 8, amount: "150.50" }, { invoice_id: 9, amount: "100.00" },
    ]);
  });

  it("no deja imputar más de lo pendiente de una deuda, ni más de lo disponible, ni importes inválidos, ni nada", async () => {
    const dialog = await openAllocation();
    const first = await dialog.findByLabelText("Imputar a Factura C 0001-00000007");
    const submit = dialog.getByRole("button", { name: "Imputar" });

    await userEvent.clear(first);
    await userEvent.type(first, "400,01");
    expect(dialog.getByText("Supera lo pendiente")).toBeTruthy();
    expect(submit).toHaveProperty("disabled", true);

    await userEvent.clear(first);
    await userEvent.type(first, "0.123");
    expect(dialog.getByText("Importe no válido")).toBeTruthy();
    expect(submit).toHaveProperty("disabled", true);

    await userEvent.clear(first);
    await userEvent.type(first, "400");
    await userEvent.type(dialog.getByLabelText("Imputar a Factura C 0001-00000009"), "1");   // 400 + 400 + 1 = 801 > 800
    expect(dialog.getByText("Lo que se imputa supera lo disponible del cobro.")).toBeTruthy();
    expect(dialog.getByText("Queda como anticipo").nextSibling?.textContent).toMatch(/-.*1,00/);
    expect(submit).toHaveProperty("disabled", true);

    await userEvent.clear(first);
    await userEvent.clear(dialog.getByLabelText("Imputar a Factura C 0001-00000008"));
    await userEvent.clear(dialog.getByLabelText("Imputar a Factura C 0001-00000009"));
    expect(submit).toHaveProperty("disabled", true);                                         // nada que imputar
  });

  it("no deja imputar más de lo pendiente de una deuda aunque el cobro alcance de sobra", async () => {
    const dialog = await openAllocation(payment({ available: "5000.00", amount: "5000.00" }));
    const first = await dialog.findByLabelText("Imputar a Factura C 0001-00000007");
    for (const other of ["Factura C 0001-00000008", "Factura C 0001-00000009"]) await userEvent.clear(dialog.getByLabelText(`Imputar a ${other}`));

    await userEvent.clear(first);
    await userEvent.type(first, "400");
    expect(dialog.getByRole("button", { name: "Imputar" })).toHaveProperty("disabled", false);
    await userEvent.type(first, ".01");

    expect(dialog.getByText("Supera lo pendiente")).toBeTruthy();
    expect(dialog.getByRole("button", { name: "Imputar" })).toHaveProperty("disabled", true);
  });

  it("restablece la propuesta y al cambiar el orden la vuelve a pedir descartando lo escrito", async () => {
    const dialog = await openAllocation();
    const first = await dialog.findByLabelText("Imputar a Factura C 0001-00000007");
    expect(dialog.queryByRole("button", { name: "Restablecer propuesta" })).toBeNull();

    await userEvent.clear(first);
    await userEvent.type(first, "50");
    await userEvent.click(dialog.getByRole("button", { name: "Restablecer propuesta" }));
    expect(dialog.getByLabelText("Imputar a Factura C 0001-00000007")).toHaveProperty("value", "400.00");

    await userEvent.type(dialog.getByLabelText("Imputar a Factura C 0001-00000007"), "0");
    await userEvent.selectOptions(dialog.getByLabelText(/Repartir empezando/), "due_date");
    await waitFor(() => expect(getAllocationSuggestion.mock.lastCall?.[1]).toMatchObject({ order: "due_date" }));
    expect(await dialog.findByLabelText("Imputar a Factura C 0001-00000007")).toHaveProperty("value", "400.00");
  });

  it("un doble click lo manda una sola vez y mientras tanto no se puede cerrar", async () => {
    const slow = deferred<Payment>();
    allocatePayment.mockReturnValue(slow.promise);
    const dialog = await openAllocation();
    await dialog.findByLabelText("Imputar a Factura C 0001-00000007");

    await userEvent.click(dialog.getByRole("button", { name: "Imputar" }));
    await userEvent.dblClick(dialog.getByRole("button", { name: /Imputar/ }));

    expect(dialog.getByRole("status", { name: "Imputando el cobro" })).toBeTruthy();
    expect(dialog.getByRole("button", { name: "Cerrar sin imputar" })).toHaveProperty("disabled", true);
    slow.resolve(payment({ available: "0.00" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(allocatePayment).toHaveBeenCalledTimes(1);
  });

  it("si falla reenvía con la misma clave los mismos importes; si los cambia, con otra", async () => {
    allocatePayment.mockRejectedValueOnce(new Error("Sin conexión")).mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValue(payment());
    const dialog = await openAllocation();
    await dialog.findByLabelText("Imputar a Factura C 0001-00000007");

    await userEvent.click(dialog.getByRole("button", { name: "Imputar" }));
    await dialog.findByText("Sin conexión");
    await userEvent.click(dialog.getByRole("button", { name: "Imputar" }));
    await waitFor(() => expect(allocatePayment).toHaveBeenCalledTimes(2));
    expect(allocatePayment.mock.calls[1][2]).toBe(allocatePayment.mock.calls[0][2]);

    await userEvent.clear(dialog.getByLabelText("Imputar a Factura C 0001-00000008"));
    await userEvent.type(dialog.getByLabelText("Imputar a Factura C 0001-00000008"), "100");
    await userEvent.click(dialog.getByRole("button", { name: "Imputar" }));
    await waitFor(() => expect(allocatePayment).toHaveBeenCalledTimes(3));
    expect(allocatePayment.mock.calls[2][2]).not.toBe(allocatePayment.mock.calls[0][2]);
  });

  it("si los saldos cambiaron (el servidor lo rechaza) avisa y vuelve a pedir la propuesta", async () => {
    allocatePayment.mockRejectedValueOnce(new ApiError("El importe supera lo pendiente de Factura C 0001-00000007 (100.00).", 422, "RECEIVABLES_ALLOCATION_EXCEEDS_PENDING"));
    const dialog = await openAllocation();
    await dialog.findByLabelText("Imputar a Factura C 0001-00000007");
    const before = getAllocationSuggestion.mock.calls.length;

    await userEvent.click(dialog.getByRole("button", { name: "Imputar" }));

    expect(await dialog.findByText(/supera lo pendiente de Factura C 0001-00000007/)).toBeTruthy();
    await waitFor(() => expect(getAllocationSuggestion.mock.calls.length).toBeGreaterThan(before));
  });

  it("un error que no es de saldos no vuelve a pedir la propuesta", async () => {
    allocatePayment.mockRejectedValueOnce(new ApiError("Error interno", 500));
    const dialog = await openAllocation();
    await dialog.findByLabelText("Imputar a Factura C 0001-00000007");
    const before = getAllocationSuggestion.mock.calls.length;

    await userEvent.click(dialog.getByRole("button", { name: "Imputar" }));

    await dialog.findByText("Error interno");
    expect(getAllocationSuggestion.mock.calls.length).toBe(before);
  });

  it("sin deudas pendientes el cobro queda como anticipo y se puede cerrar", async () => {
    listPayments.mockResolvedValue(page([payment()]));
    getAllocationSuggestion.mockResolvedValue(suggestion([]));
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Imputar cobro 1" }));
    const dialog = within(await screen.findByRole("dialog"));

    expect(await dialog.findByText(/no tiene deudas pendientes: el cobro queda como anticipo/)).toBeTruthy();
    expect(dialog.getByRole("button", { name: "Imputar" })).toHaveProperty("disabled", true);
    await userEvent.click(dialog.getByRole("button", { name: "Dejar como anticipo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(allocatePayment).not.toHaveBeenCalled();
  });

  it("si no se puede cargar la propuesta lo informa", async () => {
    listPayments.mockResolvedValue(page([payment()]));
    getAllocationSuggestion.mockRejectedValue(new Error("No se pudo calcular la propuesta"));
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: "Imputar cobro 1" }));

    expect(await screen.findByText("No se pudo calcular la propuesta")).toBeTruthy();
  });
});

// el detalle se prueba en PaymentDetail.test.tsx; acá solo que se abre desde el listado
describe("Cobros: detalle", () => {
  it("Ver abre el detalle del cobro con sus imputaciones", async () => {
    getPayment.mockResolvedValue(payment({ allocations: [allocation()], allocated: "400.00", available: "600.00" }));
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Ver cobro 1" }));

    expect(await screen.findByText("Cobro #1")).toBeTruthy();
    expect(await screen.findByText("Factura C 0001-00000007")).toBeTruthy();
    expect(getPayment.mock.calls[0][0]).toBe(1);
  });
});
