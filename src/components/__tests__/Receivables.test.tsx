import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "../../config/permissions";
import { signIn, signOut } from "../../test/session";
import { page, payment } from "../../test/payments";
import type { OpeningState } from "../../types/receivables";
import Receivables from "../Receivables";

const getOpening = vi.fn();
const listPayments = vi.fn();

vi.mock("../../services/receivablesService", () => ({
  getOpening: (...a: unknown[]) => getOpening(...a),
  startOpening: vi.fn(), updateOpeningDate: vi.fn(), getOpeningCandidates: vi.fn().mockResolvedValue([]), addOpeningItem: vi.fn(),
  voidOpeningItem: vi.fn(), confirmOpening: vi.fn(), getOpeningWarnings: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../services/paymentsService", () => ({
  listPayments: (...a: unknown[]) => listPayments(...a), getPayment: vi.fn(), registerPayment: vi.fn(), voidPayment: vi.fn(),
  allocatePayment: vi.fn(), releaseAllocation: vi.fn(), getAllocationSuggestion: vi.fn(),
}));
vi.mock("../../services/crudService", () => ({ getResources: vi.fn().mockResolvedValue([]) }));

const state = (status: "draft" | "confirmed" | null): OpeningState => ({
  opening: status === null ? null : { id: 1, opening_date: "2026-11-10", status, confirmed_at: status === "confirmed" ? "2026-11-10T10:00:00-03:00" : null, confirmed_by: 7, historical_invoices: 2 },
  items: [], totals: { items: 0, amount: "0.00" },
});

const renderScreen = () => render(<MemoryRouter><Receivables /></MemoryRouter>);

beforeEach(() => {
  signIn({ organizationId: 1, permissions: [P.paymentView, P.paymentManage, P.paymentAllocate] });
  getOpening.mockReset().mockResolvedValue(state("confirmed"));
  listPayments.mockReset().mockResolvedValue(page([payment()]));
});

afterEach(() => signOut());

describe("Cuenta corriente: contenedor", () => {
  it("sin apertura muestra solo el inicio de la apertura (todavía no hay cobros)", async () => {
    getOpening.mockResolvedValue(state(null));
    renderScreen();

    expect(await screen.findByRole("button", { name: "Iniciar apertura" })).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(listPayments).not.toHaveBeenCalled();
  });

  it("con la apertura en borrador sigue mostrando solo la apertura", async () => {
    getOpening.mockResolvedValue(state("draft"));
    renderScreen();

    expect(await screen.findByText("Borrador")).toBeTruthy();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(listPayments).not.toHaveBeenCalled();
  });

  it("con la apertura confirmada muestra las pestañas y los cobros por defecto", async () => {
    renderScreen();

    expect(await screen.findByRole("tab", { name: "Cobros", selected: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Apertura", selected: false })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Registrar cobro" })).toBeTruthy();
    expect(await screen.findByText("Cobros registrados")).toBeTruthy();
  });

  it("la pestaña Apertura muestra la apertura confirmada, de solo lectura", async () => {
    renderScreen();

    await userEvent.click(await screen.findByRole("tab", { name: "Apertura" }));

    expect(await screen.findByText(/Confirmada el 10\/11\/2026/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Apertura", selected: true })).toBeTruthy();
  });

  it("le pasa a los cobros la fecha de apertura (ningún cobro puede ser anterior)", async () => {
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: "Registrar cobro" }));
    const dateField = await screen.findByLabelText("Fecha del cobro");
    await userEvent.clear(dateField);
    await userEvent.type(dateField, "09112026");

    expect(await screen.findByText(/No puede ser anterior a la apertura \(10\/11\/2026\)/)).toBeTruthy();
  });

  it("si no se puede cargar el estado lo informa", async () => {
    getOpening.mockRejectedValue(new Error("Sin conexión con el servidor"));
    renderScreen();

    expect(await screen.findByText("Sin conexión con el servidor")).toBeTruthy();
  });
});
