import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signIn, signOut } from "../../test/session";
import Customers from "../Customers";
import InvoiceSearch from "../InvoiceSearch";

const apiRequest = vi.fn();
const downloadExport = vi.fn();

vi.mock("../../services/apiClient", () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));
vi.mock("../../services/exportService", () => ({ downloadExport: (...args: unknown[]) => downloadExport(...args) }));

const invoice = (id: number) => ({
  id, cbte_nro: id, issue_date: "2026-11-05", created_at: "2026-11-05T10:00:00", total: 1000 + id, cae: `7000${id}`, cae_expiration: "2026-12-01",
  afip_environment: "produccion", customer_id: 1, sale_point_id: 1, customer: { name: "Acme SA" }, sale_point: { number: 1 }, voucher_type: { description: "Factura C" },
});

/** La respuesta paginada de la API para la grilla. */
const page = (total: number, shown: number, current = 1) => ({
  data: Array.from({ length: shown }, (_, i) => invoice(i + 1)), current_page: current, last_page: Math.ceil(total / 10), per_page: 10, total, from: 1, to: shown,
});

const renderSearch = async (result: unknown) => {
  apiRequest.mockImplementation(async (path: string) => (path.startsWith("/invoices") ? result : []));
  render(
    <MemoryRouter>
      <InvoiceSearch />
    </MemoryRouter>,
  );
  await screen.findByText("Comprobantes emitidos");
};

beforeEach(() => {
  apiRequest.mockReset();
  downloadExport.mockReset().mockResolvedValue({ fileName: "comprobantes-2026-11-19.xlsx", rows: 25 });
  signIn({ organizationId: 1, permissions: ["sales.invoice.view", "sales.customer.view"] });
});

afterEach(() => signOut());

describe("Comprobantes emitidos: exportar", () => {
  it("ofrece Pantalla (lo que se ve) y Todo (las 3 páginas de la búsqueda), con la cantidad de cada uno", async () => {
    await renderSearch(page(25, 10));
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Exportar a Excel/ }));

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Pantalla")).toBeTruthy();
    expect(within(menu).getByText("(10 filas)")).toBeTruthy();
    expect(within(menu).getByText("Todo")).toBeTruthy();
    expect(within(menu).getByText("(25 filas)")).toBeTruthy();
  });

  it("Pantalla manda la página y el tamaño que muestra la grilla, y los filtros por defecto", async () => {
    await renderSearch(page(25, 10));
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Exportar a Excel/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Pantalla/ }));

    expect(downloadExport).toHaveBeenCalledWith("/invoices/export", "page", { afip_environment: "produccion", page: "1", per_page: "10" });
  });

  it("Todo manda los filtros aplicados (no los que se están escribiendo) y no manda página", async () => {
    await renderSearch(page(25, 10));
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Cliente (nombre o documento)"), "Pérez");
    // todavía no se aplicó la búsqueda: la exportación no debe usar lo escrito a medias
    await user.click(await screen.findByRole("button", { name: /Exportar a Excel/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Todo/ }));
    expect(downloadExport).toHaveBeenLastCalledWith("/invoices/export", "all", { afip_environment: "produccion" });

    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => String(c[0]).includes("customer=P%C3%A9rez"))).toBe(true));

    await user.click(await screen.findByRole("button", { name: /Exportar a Excel/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Todo/ }));
    expect(downloadExport).toHaveBeenLastCalledWith("/invoices/export", "all", { afip_environment: "produccion", customer: "Pérez" });
  });

  it("si toda la búsqueda entra en una página hay un solo botón, con la cantidad", async () => {
    await renderSearch(page(4, 4));

    expect(await screen.findByRole("button", { name: "Exportar a Excel (4 filas)" })).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("sin resultados no hay nada para exportar", async () => {
    await renderSearch(page(0, 0));

    await screen.findByText("No se encontraron comprobantes.");
    expect(screen.queryByRole("button", { name: /Exportar a Excel/ })).toBeNull();
  });

  it("si el servidor la rechaza muestra el motivo sin romper la grilla", async () => {
    downloadExport.mockRejectedValue(new Error("La exportación tiene 60.000 filas y el máximo es 50.000. Acotá los filtros y volvé a intentar."));
    await renderSearch(page(25, 10));
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Exportar a Excel/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Todo/ }));

    expect((await screen.findByRole("alert")).textContent).toContain("Acotá los filtros");
    expect(screen.getAllByText("Acme SA").length).toBeGreaterThan(0);
  });
});

describe("Clientes: exportar", () => {
  const renderCustomers = async () => {
    apiRequest.mockImplementation(async (path: string) =>
      path === "/customers"
        ? [{ id: 1, name: "Acme SA", document_number: "30711111111", document_type_id: 1, tax_condition_id: 1 }, { id: 2, name: "Beta SRL", document_number: "30722222222", document_type_id: 1, tax_condition_id: 1 }]
        : [],
    );
    render(<Customers />);
    await screen.findByText("Acme SA");
  };

  it("con permiso para ver clientes hay un botón con la cantidad (la grilla muestra todos: pantalla y todo es lo mismo)", async () => {
    await renderCustomers();
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Exportar a Excel (2 filas)" }));

    expect(downloadExport).toHaveBeenCalledWith("/customers/export", "all", {});
  });

  it("poder emitir comprobantes no alcanza: sin permiso para ver clientes no hay botón", async () => {
    signIn({ organizationId: 1, permissions: ["sales.invoice.issue"] });
    await renderCustomers();

    expect(screen.queryByRole("button", { name: /Exportar a Excel/ })).toBeNull();
  });

  it("quien administra clientes también puede exportar", async () => {
    signIn({ organizationId: 1, permissions: ["sales.customer.manage"] });
    await renderCustomers();

    expect(await screen.findByRole("button", { name: "Exportar a Excel (2 filas)" })).toBeTruthy();
  });
});
