import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "../../config/permissions";
import { ApiError } from "../../services/apiClient";
import { signIn, signOut } from "../../test/session";
import type { CandidateGroup, OpeningItem, OpeningState, OpeningWarning } from "../../types/receivables";
import { todayInArgentina } from "../../utils/dates";
import Receivables from "../Receivables";

const getOpening = vi.fn();
const startOpening = vi.fn();
const updateOpeningDate = vi.fn();
const getOpeningCandidates = vi.fn();
const addOpeningItem = vi.fn();
const voidOpeningItem = vi.fn();
const confirmOpening = vi.fn();
const getOpeningWarnings = vi.fn();
const getResources = vi.fn();

vi.mock("../../services/receivablesService", () => ({
  getOpening: (...a: unknown[]) => getOpening(...a),
  startOpening: (...a: unknown[]) => startOpening(...a),
  updateOpeningDate: (...a: unknown[]) => updateOpeningDate(...a),
  getOpeningCandidates: (...a: unknown[]) => getOpeningCandidates(...a),
  addOpeningItem: (...a: unknown[]) => addOpeningItem(...a),
  voidOpeningItem: (...a: unknown[]) => voidOpeningItem(...a),
  confirmOpening: (...a: unknown[]) => confirmOpening(...a),
  getOpeningWarnings: (...a: unknown[]) => getOpeningWarnings(...a),
}));
vi.mock("../../services/crudService", () => ({ getResources: (...a: unknown[]) => getResources(...a) }));

// ------------------------------------------------------------------ datos

const item = (extra: Partial<OpeningItem> = {}): OpeningItem => ({
  id: 1, customer_id: 10, customer_name: "Acme SA", invoice_id: 5, invoice_number: "Factura C 0001-00000005",
  amount: "600.00", description: null, voided_at: null, ...extra,
});

const draft = (items: OpeningItem[] = [], date = "2026-11-18"): OpeningState => ({
  opening: { id: 1, opening_date: date, status: "draft", confirmed_at: null, confirmed_by: null, historical_invoices: 3 },
  items,
  totals: { items: items.filter((i) => !i.voided_at).length, amount: items.filter((i) => !i.voided_at).reduce((s, i) => s + Number(i.amount), 0).toFixed(2) },
});

const confirmed = (items: OpeningItem[] = [item()]): OpeningState => ({
  ...draft(items),
  opening: { id: 1, opening_date: "2026-11-18", status: "confirmed", confirmed_at: "2026-11-19T10:00:00-03:00", confirmed_by: 7, historical_invoices: 3 },
});

const none: OpeningState = { opening: null, items: [], totals: { items: 0, amount: "0.00" } };

const candidates: CandidateGroup[] = [
  {
    customer_id: 10, customer_name: "Acme SA",
    invoices: [
      { invoice_id: 5, number: "Factura C 0001-00000005", issue_date: "2026-10-01", payment_due_date: null, total: "1000.00" },
      { invoice_id: 6, number: "Factura C 0001-00000006", issue_date: "2026-10-05", payment_due_date: null, total: "400.00" },
    ],
  },
  { customer_id: 11, customer_name: "Beta SRL", invoices: [{ invoice_id: 7, number: "Factura C 0001-00000007", issue_date: "2026-10-09", payment_due_date: null, total: "250.00" }] },
];

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const renderScreen = () => render(<MemoryRouter><Receivables /></MemoryRouter>);

/** El selector de clientes existe antes de que lleguen sus opciones: se espera a que estén cargadas */
const customerSelect = async (): Promise<HTMLElement> => {
  const select = await screen.findByLabelText("Cliente");
  await screen.findByRole("option", { name: "Acme SA" });
  return select;
};

const as = (...permissions: string[]) => signIn({ organizationId: 1, permissions });

beforeEach(() => {
  as(P.paymentView, P.paymentManage);
  getOpening.mockReset().mockResolvedValue(none);
  startOpening.mockReset().mockResolvedValue(draft());
  updateOpeningDate.mockReset().mockResolvedValue(draft());
  getOpeningCandidates.mockReset().mockResolvedValue([]);
  addOpeningItem.mockReset().mockResolvedValue(draft());
  voidOpeningItem.mockReset().mockResolvedValue(draft());
  confirmOpening.mockReset().mockResolvedValue(confirmed());
  getOpeningWarnings.mockReset().mockResolvedValue([]);
  getResources.mockReset().mockResolvedValue([{ id: 10, name: "Acme SA" }, { id: 11, name: "Beta SRL" }]);
});

afterEach(() => signOut());

describe("Apertura de la cuenta corriente", () => {
  // ------------------------------------------------------------------ iniciar

  describe("sin apertura", () => {
    it("ofrece iniciarla con la fecha de hoy y la manda en ISO", async () => {
      renderScreen();

      const button = await screen.findByRole("button", { name: "Iniciar apertura" });
      expect(screen.getByLabelText("Fecha de apertura")).toHaveProperty("value", todayInArgentina().split("-").reverse().join("/"));

      getOpening.mockResolvedValue(draft());
      await userEvent.click(button);

      expect(startOpening).toHaveBeenCalledWith(todayInArgentina());
      await screen.findByText("Borrador");
    });

    it("sin fecha válida no se puede iniciar", async () => {
      renderScreen();
      const date = await screen.findByLabelText("Fecha de apertura");

      await userEvent.clear(date);

      expect(screen.getByRole("button", { name: "Iniciar apertura" })).toHaveProperty("disabled", true);
    });

    it("un segundo click mientras se inicia no vuelve a llamar al servidor y el botón muestra el spinner", async () => {
      const slow = deferred<OpeningState>();
      startOpening.mockReturnValue(slow.promise);
      renderScreen();

      const button = await screen.findByRole("button", { name: "Iniciar apertura" });
      await userEvent.click(button);

      await waitFor(() => expect(screen.getByRole("button", { name: /Iniciar apertura/ })).toHaveProperty("disabled", true));
      expect(screen.getByRole("status", { name: "Iniciando la apertura" })).toBeTruthy();
      await userEvent.click(screen.getByRole("button", { name: /Iniciar apertura/ }));
      await userEvent.dblClick(screen.getByRole("button", { name: /Iniciar apertura/ }));

      slow.resolve(draft());
      await waitFor(() => expect(screen.queryByRole("status", { name: "Iniciando la apertura" })).toBeNull());
      expect(startOpening).toHaveBeenCalledTimes(1);
    });

    it("quien solo puede ver no ve el botón para iniciar", async () => {
      signOut();
      as(P.paymentView);
      renderScreen();

      expect(await screen.findByText("La cuenta corriente todavía no está abierta")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Iniciar apertura" })).toBeNull();
    });

    it("si no se pudo iniciar muestra el motivo del servidor y deja volver a intentar", async () => {
      startOpening.mockRejectedValueOnce(new ApiError("La fecha de apertura no puede ser futura.", 422, "RECEIVABLES_OPENING_DATE_INVALID"));
      renderScreen();

      await userEvent.click(await screen.findByRole("button", { name: "Iniciar apertura" }));

      expect((await screen.findByText("La fecha de apertura no puede ser futura.")).textContent).toBeTruthy();
      expect(screen.getByRole("button", { name: "Iniciar apertura" })).toHaveProperty("disabled", false);
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("si otra persona ya la inició, vuelve a cargar y muestra el borrador", async () => {
      startOpening.mockRejectedValueOnce(new ApiError("La cuenta corriente de la empresa ya tiene una apertura.", 409, "RECEIVABLES_OPENING_EXISTS"));
      getOpening.mockReset().mockResolvedValueOnce(none).mockResolvedValue(draft());   // la segunda consulta ya encuentra el borrador de la otra persona
      renderScreen();
      await userEvent.click(await screen.findByRole("button", { name: "Iniciar apertura" }));

      expect(await screen.findByText("Borrador")).toBeTruthy();
    });
  });

  // ------------------------------------------------------------------ borrador

  describe("borrador", () => {
    beforeEach(() => {
      getOpening.mockResolvedValue(draft([item()]));
      getOpeningCandidates.mockResolvedValue(candidates);
    });

    it("muestra la fecha, el estado, los comprobantes anteriores y lo ya cargado", async () => {
      renderScreen();

      expect(await screen.findByText("Borrador")).toBeTruthy();
      expect(screen.getByText("3 comprobantes anteriores")).toBeTruthy();
      expect(screen.getByLabelText("Fecha de apertura")).toHaveProperty("value", "18/11/2026");
      expect(await screen.findByText("Beta SRL", { selector: "h3" })).toBeTruthy();
      expect(screen.getByLabelText("Pendiente de Factura C 0001-00000005")).toHaveProperty("value", "1000.00");
      const loaded = within(screen.getByText("Lo que se debía al abrir").closest("div[data-slot='card']") as HTMLElement);
      expect(loaded.getByText("Factura C 0001-00000005")).toBeTruthy();
      expect(loaded.getByText(/Total \(1 partida\)/)).toBeTruthy();
    });

    it("carga un comprobante anterior por su total o por lo que falta, y vuelve a pedir la lista", async () => {
      renderScreen();
      await screen.findByText("Beta SRL", { selector: "h3" });

      // Al cargarla el servidor devuelve el estado con la partida nueva: recién entonces se vuelve a pedir la lista de pendientes
      getOpening.mockResolvedValue(draft([item(), item({ id: 3, customer_id: 11, customer_name: "Beta SRL", invoice_id: 7, invoice_number: "Factura C 0001-00000007", amount: "250.00" })]));
      await userEvent.click(screen.getByRole("button", { name: "Cargar Factura C 0001-00000007" }));
      expect(addOpeningItem).toHaveBeenLastCalledWith({ customer_id: 11, invoice_id: 7, amount: "250.00" });

      const field = screen.getByLabelText("Pendiente de Factura C 0001-00000005");
      await userEvent.clear(field);
      await userEvent.type(field, "300,5");
      expect(field).toHaveProperty("value", "300,5");                      // el campo muestra lo escrito...
      expect(screen.getByText(/Se carga .*300,50/)).toBeTruthy();         // ...y avisa qué se va a cargar
      await userEvent.click(screen.getByRole("button", { name: "Cargar Factura C 0001-00000005" }));
      expect(addOpeningItem).toHaveBeenLastCalledWith({ customer_id: 10, invoice_id: 5, amount: "300.50" });

      await waitFor(() => expect(getOpeningCandidates.mock.calls.length).toBeGreaterThan(1));
    });

    it("tipear un importe argentino con puntos de miles carácter por carácter se carga bien", async () => {
      renderScreen();
      await screen.findByText("Beta SRL", { selector: "h3" });
      const field = screen.getByLabelText("Pendiente de Factura C 0001-00000005");

      await userEvent.clear(field);
      await userEvent.type(field, "1.000,00");

      expect(field).toHaveProperty("value", "1.000,00");
      await userEvent.click(screen.getByRole("button", { name: "Cargar Factura C 0001-00000005" }));
      expect(addOpeningItem).toHaveBeenLastCalledWith({ customer_id: 10, invoice_id: 5, amount: "1000.00" });
    });

    it("un importe ambiguo o inválido no se interpreta: avisa y no deja cargar", async () => {
      renderScreen();
      await screen.findByText("Beta SRL", { selector: "h3" });
      const field = screen.getByLabelText("Pendiente de Factura C 0001-00000005");
      const button = screen.getByRole("button", { name: "Cargar Factura C 0001-00000005" });

      await userEvent.clear(field);
      await userEvent.type(field, "0.123");
      await userEvent.tab();

      expect(button).toHaveProperty("disabled", true);
      expect(screen.getByText("Importe no válido. Ej.: 1500,75")).toBeTruthy();
      expect(field.getAttribute("aria-invalid")).toBe("true");

      await userEvent.clear(field);
      await userEvent.type(field, "1.000,01");
      await userEvent.tab();
      expect(screen.getByText(/No puede superar el total/)).toBeTruthy();
      expect(button).toHaveProperty("disabled", true);
    });

    it("no deja cargar un importe vacío, en cero o mayor al total del comprobante", async () => {
      renderScreen();
      await screen.findByText("Beta SRL", { selector: "h3" });
      const field = screen.getByLabelText("Pendiente de Factura C 0001-00000005");
      const button = screen.getByRole("button", { name: "Cargar Factura C 0001-00000005" });

      for (const bad of ["", "0", "1000.01"]) {
        await userEvent.clear(field);
        if (bad) await userEvent.type(field, bad);
        expect(button).toHaveProperty("disabled", true);
      }

      await userEvent.clear(field);
      await userEvent.type(field, "1000");
      expect(button).toHaveProperty("disabled", false);
    });

    it("un doble click al cargar un comprobante lo manda una sola vez y mientras tanto todo queda deshabilitado", async () => {
      const slow = deferred<OpeningState>();
      addOpeningItem.mockReturnValue(slow.promise);
      renderScreen();
      await screen.findByText("Beta SRL", { selector: "h3" });

      const button = screen.getByRole("button", { name: "Cargar Factura C 0001-00000007" });
      await userEvent.click(button);
      await userEvent.dblClick(screen.getByRole("button", { name: /Cargar Factura C 0001-00000007/ }));

      // el botón de la acción muestra el spinner y TODOS los demás botones de la pantalla quedan deshabilitados
      expect(screen.getByRole("status", { name: "Cargando Factura C 0001-00000007" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Cargar Factura C 0001-00000005" })).toHaveProperty("disabled", true);
      expect(screen.getByRole("button", { name: "Anular Factura C 0001-00000005" })).toHaveProperty("disabled", true);
      expect(screen.getByRole("button", { name: "Confirmar apertura" })).toHaveProperty("disabled", true);

      slow.resolve(draft());
      await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
      expect(addOpeningItem).toHaveBeenCalledTimes(1);
    });

    it("carga todos los comprobantes de un cliente con su total, uno por uno", async () => {
      renderScreen();
      await screen.findByText("Beta SRL", { selector: "h3" });

      await userEvent.click(screen.getByRole("button", { name: "Cargar todos con su total" }));

      await waitFor(() => expect(addOpeningItem).toHaveBeenCalledTimes(2));
      expect(addOpeningItem.mock.calls.map((c) => c[0])).toEqual([
        { customer_id: 10, invoice_id: 5, amount: "1000.00" },
        { customer_id: 10, invoice_id: 6, amount: "400.00" },
      ]);
    });

    it("si falla una de las cargas masivas, se corta ahí y se muestra el motivo", async () => {
      addOpeningItem.mockResolvedValueOnce(draft()).mockRejectedValueOnce(new ApiError("El importe pendiente no puede superar el total del comprobante (400.00).", 422, "RECEIVABLES_INVOICE_NOT_ELIGIBLE"));
      renderScreen();
      await screen.findByText("Beta SRL", { selector: "h3" });

      await userEvent.click(screen.getByRole("button", { name: "Cargar todos con su total" }));

      expect(await screen.findByText(/no puede superar el total/)).toBeTruthy();
      expect(addOpeningItem).toHaveBeenCalledTimes(2);
    });

    it("sin comprobantes anteriores pendientes lo explica", async () => {
      getOpeningCandidates.mockResolvedValue([]);
      renderScreen();

      expect(await screen.findByText("No hay comprobantes anteriores pendientes de cargar.")).toBeTruthy();
    });

    it("anula una partida cargada", async () => {
      renderScreen();

      await userEvent.click(await screen.findByRole("button", { name: "Anular Factura C 0001-00000005" }));

      expect(voidOpeningItem).toHaveBeenCalledWith(1);
    });

    it("una partida anulada se ve tachada, con su etiqueta y sin botón, y no suma al total", async () => {
      getOpening.mockResolvedValue(draft([item(), item({ id: 2, invoice_id: null, invoice_number: null, description: "Saldo viejo", amount: "50.00", voided_at: "2026-11-19T10:00:00-03:00" })]));
      renderScreen();

      const row = (await screen.findByText("Saldo viejo")).closest("tr") as HTMLElement;
      expect(within(row).getByText("Anulada")).toBeTruthy();
      expect(within(row).queryByRole("button")).toBeNull();
      expect(screen.getByText(/Total \(1 partida\)/)).toBeTruthy();
    });

    it("cambia la fecha de apertura solo cuando se modifica", async () => {
      renderScreen();
      const date = await screen.findByLabelText("Fecha de apertura");
      expect(screen.queryByRole("button", { name: "Guardar fecha" })).toBeNull();

      await userEvent.clear(date);
      await userEvent.type(date, "17112026");
      await userEvent.click(await screen.findByRole("button", { name: "Guardar fecha" }));

      expect(updateOpeningDate).toHaveBeenCalledWith("2026-11-17");
    });

    it("sin ninguna partida avisa que se puede confirmar igual", async () => {
      getOpening.mockResolvedValue(draft([]));
      renderScreen();

      expect(await screen.findByText(/Si ningún cliente debía nada, se puede confirmar la apertura así/)).toBeTruthy();
    });
  });

  // ------------------------------------------------------------------ saldo sin comprobante

  describe("saldo sin comprobante", () => {
    beforeEach(() => getOpening.mockResolvedValue(draft()));

    it("pide cliente, importe y de qué es; manda la descripción y limpia el formulario", async () => {
      renderScreen();
      const add = await screen.findByRole("button", { name: "Agregar saldo" });
      expect(add).toHaveProperty("disabled", true);

      await userEvent.selectOptions(await customerSelect(), "11");
      await userEvent.type(screen.getByLabelText("Importe"), "150,25");
      expect(screen.getByText(/Se cargará .*150,25/)).toBeTruthy();
      expect(add).toHaveProperty("disabled", true);                      // falta decir de qué es
      await userEvent.type(screen.getByLabelText("De qué es"), "  Saldo según planilla ");
      expect(add).toHaveProperty("disabled", false);

      await userEvent.click(add);

      expect(addOpeningItem).toHaveBeenCalledWith({ customer_id: 11, amount: "150.25", description: "Saldo según planilla" });
      await waitFor(() => expect(screen.getByLabelText("Importe")).toHaveProperty("value", ""));
      expect(screen.getByLabelText("De qué es")).toHaveProperty("value", "");
    });

    it("si el servidor lo rechaza muestra el error y conserva lo escrito", async () => {
      addOpeningItem.mockRejectedValueOnce(new ApiError("El importe debe ser mayor a cero.", 422));
      renderScreen();

      await userEvent.selectOptions(await customerSelect(), "10");
      await userEvent.type(screen.getByLabelText("Importe"), "5");
      await userEvent.type(screen.getByLabelText("De qué es"), "Algo");
      await userEvent.click(screen.getByRole("button", { name: "Agregar saldo" }));

      expect(await screen.findByText("El importe debe ser mayor a cero.")).toBeTruthy();
      expect(screen.getByLabelText("De qué es")).toHaveProperty("value", "Algo");
    });

    it("un doble click lo manda una sola vez", async () => {
      const slow = deferred<OpeningState>();
      addOpeningItem.mockReturnValue(slow.promise);
      renderScreen();

      await userEvent.selectOptions(await customerSelect(), "10");
      await userEvent.type(screen.getByLabelText("Importe"), "5");
      await userEvent.type(screen.getByLabelText("De qué es"), "Algo");
      await userEvent.click(screen.getByRole("button", { name: "Agregar saldo" }));
      await userEvent.dblClick(screen.getByRole("button", { name: /Agregar saldo/ }));

      expect(screen.getByRole("status", { name: "Agregando el saldo" })).toBeTruthy();
      slow.resolve(draft());
      await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
      expect(addOpeningItem).toHaveBeenCalledTimes(1);
    });
  });

  // ------------------------------------------------------------------ confirmar

  describe("confirmar", () => {
    beforeEach(() => getOpening.mockResolvedValue(draft([item(), item({ id: 2, invoice_id: null, invoice_number: null, description: "Saldo", amount: "150.25" })])));

    it("pide confirmación con el resumen antes de cerrar la apertura", async () => {
      renderScreen();

      await userEvent.click(await screen.findByRole("button", { name: "Confirmar apertura" }));

      const dialog = within(await screen.findByRole("alertdialog"));
      expect(dialog.getByText(/Se abre el 18\/11\/2026 con 2 partidas por/)).toBeTruthy();
      expect(dialog.getByText(/no se puede modificar ni deshacer/)).toBeTruthy();
      expect(confirmOpening).not.toHaveBeenCalled();

      await userEvent.click(dialog.getByRole("button", { name: "Seguir revisando" }));
      expect(confirmOpening).not.toHaveBeenCalled();
    });

    it("confirma una sola vez aunque se haga doble click, con spinner, y muestra la apertura cerrada", async () => {
      const slow = deferred<OpeningState>();
      confirmOpening.mockReturnValue(slow.promise);
      renderScreen();
      await userEvent.click(await screen.findByRole("button", { name: "Confirmar apertura" }));
      const dialog = within(await screen.findByRole("alertdialog"));

      await userEvent.click(dialog.getByRole("button", { name: "Sí, confirmar" }));
      await userEvent.dblClick(dialog.getByRole("button", { name: /Sí, confirmar/ }));

      expect(screen.getByRole("status", { name: "Confirmando la apertura" })).toBeTruthy();
      expect(dialog.getByRole("button", { name: "Seguir revisando" })).toHaveProperty("disabled", true);

      getOpening.mockResolvedValue(confirmed());
      slow.resolve(confirmed());

      expect(await screen.findByText("La cuenta corriente quedó abierta.")).toBeTruthy();
      expect(confirmOpening).toHaveBeenCalledTimes(1);
      // Cerrada la apertura ya no se pide la lista de comprobantes anteriores (el servidor la rechazaría con un 409)
      expect(getOpeningCandidates).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(screen.getByText(/Confirmada el 19\/11\/2026/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Confirmar apertura" })).toBeNull();
    });

    it("si falla, el diálogo se cierra o queda para reintentar y se informa el motivo", async () => {
      confirmOpening.mockRejectedValueOnce(new ApiError("La apertura ya está confirmada y no se puede modificar.", 409, "RECEIVABLES_OPENING_CONFIRMED"));
      renderScreen();
      await userEvent.click(await screen.findByRole("button", { name: "Confirmar apertura" }));
      getOpening.mockResolvedValue(confirmed());

      await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Sí, confirmar" }));

      expect(await screen.findByText("La apertura ya está confirmada y no se puede modificar.")).toBeTruthy();
      expect(await screen.findByText(/Confirmada el/)).toBeTruthy();   // y se recargó: ahora se ve cerrada
    });
  });

  // ------------------------------------------------------------------ confirmada y permisos

  describe("confirmada", () => {
    it("es de solo lectura: sin edición, sin botones y con el resumen", async () => {
      getOpening.mockResolvedValue(confirmed());
      renderScreen();

      expect(await screen.findByText(/Confirmada el 19\/11\/2026/)).toBeTruthy();
      expect(screen.getByText("18/11/2026")).toBeTruthy();
      expect(screen.getByText("Factura C 0001-00000005")).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByLabelText("Fecha de apertura")).toBeNull();
      expect(getOpeningCandidates).not.toHaveBeenCalled();
      expect(screen.getByText(/La cuenta corriente está abierta/)).toBeTruthy();
    });

    it("quien solo puede ver un borrador no tiene ningún control de edición", async () => {
      signOut();
      as(P.paymentView);
      getOpening.mockResolvedValue(draft([item()]));
      renderScreen();

      expect(await screen.findByText("Borrador")).toBeTruthy();
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByLabelText("Fecha de apertura")).toBeNull();
      expect(getOpeningCandidates).not.toHaveBeenCalled();
      expect(screen.getByText(/Una persona con permiso para registrar cobros tiene que completarla/)).toBeTruthy();
    });
  });

  // ------------------------------------------------------------------ advertencias

  describe("advertencias", () => {
    const warnings: OpeningWarning[] = [
      {
        type: "historical_invoice_not_carried", credit_note_id: 90, credit_note_number: "0001-00000090", issue_date: "2026-11-19", credit_note_total: "1000.00",
        invoice_id: 5, invoice_number: "0001-00000005", customer_id: 10, customer_name: "Acme SA", opening_amount: null, applied: "0.00", excess: "1000.00",
      },
      {
        type: "exceeds_opening_item", credit_note_id: 91, credit_note_number: "0001-00000091", issue_date: "2026-11-19", credit_note_total: "1000.00",
        invoice_id: 6, invoice_number: "0001-00000006", customer_id: 11, customer_name: "Beta SRL", opening_amount: "300.00", applied: "300.00", excess: "700.00",
      },
    ];

    it("lista las notas de crédito que hay que regularizar a mano, explicando cada caso", async () => {
      getOpening.mockResolvedValue(confirmed());
      getOpeningWarnings.mockResolvedValue(warnings);
      renderScreen();

      const alert = within((await screen.findByText("Notas de crédito para regularizar a mano")).closest("[role='alert']") as HTMLElement);
      expect(alert.getByText(/Acme SA/)).toBeTruthy();
      expect(alert.getByText(/que no se cargó como pendiente/)).toBeTruthy();
      expect(alert.getByText(/Beta SRL/)).toBeTruthy();
      expect(alert.getByText(/se acreditan .*300,00 y quedan .*700,00 sin aplicar/)).toBeTruthy();
    });

    it("sin advertencias no muestra nada", async () => {
      getOpening.mockResolvedValue(confirmed());
      renderScreen();

      await screen.findByText(/Confirmada el/);
      expect(screen.queryByText("Notas de crédito para regularizar a mano")).toBeNull();
    });
  });

  it("si no se puede cargar el estado, lo informa", async () => {
    getOpening.mockRejectedValue(new Error("Sin conexión con el servidor"));
    renderScreen();

    expect(await screen.findByText("Sin conexión con el servidor")).toBeTruthy();
  });
});
