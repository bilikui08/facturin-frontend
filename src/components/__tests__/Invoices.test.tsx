import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Invoices from "../Invoices";

const apiRequest = vi.fn();

vi.mock("../../services/apiClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const routes: Record<string, unknown> = {
  "/customers": [{ id: 1, name: "Test 2 Monotributo" }],
  "/sale-points": [{ id: 1, number: 1, name: "Punto de venta test" }],
  "/payment-conditions": [{ id: 1, description: "Cuenta Corriente" }],
};

const setup = async () => {
  apiRequest.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (init?.method === "POST") return { id: 99 };
    if (path.startsWith("/invoices")) return [];
    return routes[path] ?? [];
  });

  render(
    <MemoryRouter>
      <Invoices />
    </MemoryRouter>,
  );
  await screen.findByText("Nuevo comprobante");
  return userEvent.setup();
};

const fillHeader = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.selectOptions(screen.getByLabelText("Cliente"), "1");
  await user.selectOptions(screen.getByLabelText("Punto de venta"), "1");
  await user.selectOptions(screen.getByLabelText("Condición de venta"), "1");
};

describe("Invoices (facturar)", () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it("el título dice cuántos comprobantes recientes muestra y se piden esa cantidad", async () => {
    await setup();

    expect(screen.getByText("Últimos 10 comprobantes emitidos")).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith("/invoices?per_page=10");
  });

  it("no deja escribir más de 2 decimales en precio y cantidad", async () => {
    const user = await setup();
    const price = screen.getByLabelText("Precio") as HTMLInputElement;
    const quantity = screen.getByLabelText("Cant.") as HTMLInputElement;

    await user.type(price, "10.999");
    await user.clear(quantity);
    await user.type(quantity, "2.555");

    expect(price.value).toBe("10.99");
    expect(quantity.value).toBe("2.55");
  });

  it("calcula el total redondeando cada línea a 2 decimales (caso de QA de ARCA 10056)", async () => {
    const user = await setup();

    await user.clear(screen.getByLabelText("Cant."));
    await user.type(screen.getByLabelText("Cant."), "2.5");
    await user.type(screen.getByLabelText("Precio"), "38784.25");

    // 2,5 × 38.784,25 = 96.960,625 → 96.960,63
    expect(screen.getByText(/96\.960,63/)).toBeTruthy();
  });

  it("emite el comprobante con importes de 2 decimales", async () => {
    const user = await setup();
    await fillHeader(user);

    await user.type(screen.getByLabelText("Descripción"), "Honorarios");
    await user.clear(screen.getByLabelText("Cant."));
    await user.type(screen.getByLabelText("Cant."), "2.5");
    await user.type(screen.getByLabelText("Precio"), "38784.25");
    await user.click(screen.getByRole("button", { name: "Emitir comprobante" }));

    await waitFor(() => expect(screen.getByText("Comprobante emitido correctamente.")).toBeTruthy());

    const post = apiRequest.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/invoices");
    const body = JSON.parse(post![1].body);
    expect(body.items).toEqual([
      { code: null, description: "Honorarios", quantity: 2.5, unit: null, price: 38784.25 },
    ]);
    expect(body.concept).toBe(2);
  });

  it("muestra el error de la API sin emitir como correcto", async () => {
    const user = await setup();
    apiRequest.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (init?.method === "POST") throw new Error("AFIP error 10056: importe inválido");
      return path.startsWith("/invoices") ? [] : (routes[path] ?? []);
    });
    await fillHeader(user);
    await user.type(screen.getByLabelText("Descripción"), "Servicio");
    await user.type(screen.getByLabelText("Precio"), "100");
    await user.click(screen.getByRole("button", { name: "Emitir comprobante" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/AFIP error 10056/)).toBeTruthy();
    expect(screen.queryByText("Comprobante emitido correctamente.")).toBeNull();
  });
});
