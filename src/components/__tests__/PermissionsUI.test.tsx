import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { P } from "../../config/permissions";
import { signIn, signOut } from "../../test/session";
import type { InvoiceRow } from "../../types/invoice";
import type { TrashItem } from "../../types/trash";
import AuditLog from "../AuditLog";
import CrudSection from "../CrudSection";
import Customers from "../Customers";
import Dashboard from "../Dashboard";
import InvoiceActions from "../InvoiceActions";
import Settings from "../Settings";
import Trash from "../Trash";

const apiRequest = vi.fn();
const getTrash = vi.fn();
const getSettings = vi.fn();
let systemAdmin = false;

vi.mock("../../services/apiClient", () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a) }));
vi.mock("../../services/crudService", () => ({
  getResources: vi.fn().mockResolvedValue([{ id: 1, name: "Ana Pérez", document_number: "20", address: "x" }]),
  getResource: vi.fn(),
  createResource: vi.fn(),
  updateResource: vi.fn(),
  deleteResource: vi.fn(),
  restoreResource: vi.fn(),
}));
vi.mock("../../services/trashService", () => ({ getTrash: (...a: unknown[]) => getTrash(...a), restoreTrashItems: vi.fn() }));
vi.mock("../../services/settingsService", () => ({ getSettings: (...a: unknown[]) => getSettings(...a), updateSettings: vi.fn() }));
vi.mock("../../hooks/useSystemAdmin", () => ({ useSystemAdmin: () => systemAdmin }));
vi.mock("../CompanySwitcher", () => ({ default: () => null }));

const as = (permissions: string[]) => signIn({ organizationId: 1, permissions });

beforeEach(() => {
  systemAdmin = false;
  apiRequest.mockReset().mockResolvedValue({ data: [], current_page: 1, last_page: 1, per_page: 25, total: 0 });
});

afterEach(() => {
  signOut();
  localStorage.clear();
});

describe("Menú según permisos", () => {
  const menu = () =>
    screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("data-slot") === "sidebar-menu-button")
      .map((l) => l.textContent);

  const renderDashboard = () =>
    render(
      <MemoryRouter initialEntries={["/dashboard/invoices-list"]}>
        <Dashboard onLogout={vi.fn()} />
      </MemoryRouter>,
    );

  it("un lector ve solo lo que puede usar", () => {
    as([P.invoiceView, P.customerView]);
    renderDashboard();

    expect(menu()).toEqual(["Comprobantes emitidos", "Clientes", "Auditoría", "Configuración"]);
    expect(screen.queryByText("Administración")).toBeNull();
  });

  it("quien emite y administra ve Facturar, Clientes, Puntos de venta y Papelera según sus permisos", () => {
    as([P.invoiceIssue, P.customerManage]);
    renderDashboard();

    expect(menu()).toEqual(["Facturar", "Comprobantes emitidos", "Clientes", "Auditoría", "Papelera", "Configuración"]);
  });

  it("Equipo aparece con el permiso de administrar personas; Empresas solo para la administración del sistema", () => {
    as([P.invoiceIssue, P.membersManage]);
    const { unmount } = renderDashboard();
    expect(menu()).toContain("Equipo");
    expect(menu()).not.toContain("Empresas");
    unmount();

    systemAdmin = true;
    renderDashboard();
    expect(menu()).toContain("Empresas");
  });

  it("una sesión anterior a las empresas ve todo el menú de trabajo", () => {
    signIn({ userId: 7 });
    renderDashboard();

    expect(menu()).toEqual([
      "Facturar", "Comprobantes emitidos", "Clientes", "Puntos de venta", "Datos de facturación", "Auditoría", "Papelera", "Equipo", "Configuración",
    ]);
  });
});

describe("Botones según permisos", () => {
  it("Clientes: sin permiso de administrar es solo consulta", async () => {
    as([P.customerView]);
    render(<MemoryRouter><Customers /></MemoryRouter>);

    expect(await screen.findByText("Ana Pérez")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Agregar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Eliminar/ })).toBeNull();
    expect(screen.queryByText("Acciones")).toBeNull();
  });

  it("Clientes: con permiso de administrar ve agregar, editar y eliminar", async () => {
    as([P.customerManage]);
    render(<MemoryRouter><Customers /></MemoryRouter>);

    expect(await screen.findByText("Ana Pérez")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Agregar cliente/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Editar/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Eliminar/ })).toBeTruthy();
  });

  it("CrudSection en solo lectura no ofrece acciones aunque haya datos", async () => {
    render(<MemoryRouter><CrudSection title="Cosas" singularName="Cosa" endpoint="/cosas" fields={[{ name: "name", label: "Nombre" }]} readOnly /></MemoryRouter>);

    expect(await screen.findByText("Ana Pérez")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Agregar/ })).toBeNull();
    expect(screen.getByText("Consultá tus cosas.")).toBeTruthy();
  });

  const invoice = { id: 5, cbte_nro: 74, sale_point: { number: 1 }, total: "100", cae: "86461089494558" } as unknown as InvoiceRow;

  it("Anular solo está para quien puede anular", () => {
    as([P.invoiceView, P.invoiceIssue]);
    const { unmount } = render(<InvoiceActions invoice={invoice} />);
    expect(screen.queryByRole("button", { name: "Anular" })).toBeNull();
    expect(screen.getByRole("button", { name: "PDF" })).toBeTruthy();
    unmount();

    as([P.invoiceView, P.invoiceAnnul]);
    render(<InvoiceActions invoice={invoice} />);
    expect(screen.getByRole("button", { name: "Anular" })).toBeTruthy();
  });

  const setting = { key: "recent_invoices_count", group: "Facturar", label: "Recientes", description: "d", unit: "n", default: 10, min: 5, max: 50, value: 10, is_default: true };

  it("Configuración: sin permiso se puede ver pero no cambiar", async () => {
    getSettings.mockReset().mockResolvedValue([setting]);
    as([P.invoiceView]);
    render(<Settings />);

    const input = (await screen.findByLabelText("Recientes")) as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.getByText(/Podés ver la configuración, pero no cambiarla/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toHaveProperty("disabled", true);
  });

  it("Configuración: con permiso se edita", async () => {
    getSettings.mockReset().mockResolvedValue([setting]);
    as([P.settingsManage]);
    render(<Settings />);

    expect(((await screen.findByLabelText("Recientes")) as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText(/pero no cambiarla/)).toBeNull();
  });

  it("Auditoría explica que sin el permiso especial solo se ven las propias acciones", async () => {
    as([P.customerManage]);
    const { unmount } = render(<AuditLog />);
    expect(await screen.findByText(/Registro de lo que hiciste vos/)).toBeTruthy();
    unmount();

    as([P.auditViewAll]);
    render(<AuditLog />);
    expect(await screen.findByText(/Registro de quién hizo qué sobre los clientes/)).toBeTruthy();
  });
});

describe("Papelera según permisos", () => {
  const items: TrashItem[] = [
    { type: "customer", type_label: "Cliente", id: 1, label: "Mío", deleted_at: "2026-11-18T10:00:00-03:00", deleted_by: 7, deleted_by_me: true, deleted_by_name: null },
    { type: "customer", type_label: "Cliente", id: 2, label: "De María", deleted_at: "2026-11-18T09:00:00-03:00", deleted_by: 9, deleted_by_me: false, deleted_by_name: "María" },
    { type: "customer", type_label: "Cliente", id: 3, label: "Sin nombre", deleted_at: "2026-11-18T08:00:00-03:00", deleted_by: 11, deleted_by_me: false, deleted_by_name: null },
    { type: "customer", type_label: "Cliente", id: 4, label: "De consola", deleted_at: "2026-11-18T07:00:00-03:00", deleted_by: null, deleted_by_me: false, deleted_by_name: null },
  ];

  beforeEach(() => {
    getTrash.mockReset().mockResolvedValue({ items, total: 4, page: 1, per_page: 20, last_page: 1 });
  });

  it("con restore-any muestra quién eliminó cada registro", async () => {
    as([P.customerManage, P.trashRestoreAny]);
    render(<MemoryRouter><Trash /></MemoryRouter>);

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Eliminado por")).toBeTruthy();
    expect(table.getByText("Vos")).toBeTruthy();
    expect(table.getByText("María")).toBeTruthy();
    expect(table.getByText("Usuario 11")).toBeTruthy();
    expect(table.getByText("Consola")).toBeTruthy();
    expect(screen.getByText("Registros eliminados en la empresa")).toBeTruthy();
  });

  it("sin restore-any no hay columna de autor y el título dice que es lo propio", async () => {
    as([P.customerManage]);
    render(<MemoryRouter><Trash /></MemoryRouter>);

    await screen.findByRole("table");
    expect(screen.queryByText("Eliminado por")).toBeNull();
    expect(screen.getByText("Registros eliminados por vos")).toBeTruthy();
  });

  it("el filtro de tipo solo ofrece lo que la persona puede administrar", async () => {
    as([P.customerManage]);
    render(<MemoryRouter><Trash /></MemoryRouter>);
    await screen.findByRole("table");

    const options = Array.from((screen.getByLabelText("Tipo") as HTMLSelectElement).options).map((o) => o.textContent);
    expect(options).toEqual(["Todos", "Clientes"]);
  });
});



