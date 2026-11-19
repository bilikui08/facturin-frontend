import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Roles from "../Roles";

const getRoles = vi.fn();
const getPermissionCatalog = vi.fn();
const createRole = vi.fn();
const updateRole = vi.fn();
const deleteRole = vi.fn();
let systemAdmin = true;

vi.mock("../../services/rolesService", () => ({
  getRoles: (...a: unknown[]) => getRoles(...a),
  getPermissionCatalog: (...a: unknown[]) => getPermissionCatalog(...a),
  createRole: (...a: unknown[]) => createRole(...a),
  updateRole: (...a: unknown[]) => updateRole(...a),
  deleteRole: (...a: unknown[]) => deleteRole(...a),
}));
vi.mock("../../hooks/useSystemAdmin", () => ({ useSystemAdmin: () => systemAdmin }));

const role = (extra = {}) => ({ id: 1, name: "cajero", description: "Cajero: cobra", is_system: false, members_count: 0, organizations_count: 0, permissions: ["sales.invoice.view"], ...extra });
const roles = [
  role({ id: 1, name: "admin", description: "Administrador del sistema", is_system: true, permissions: [] }),
  role({ id: 2, name: "company_admin", description: "Administrador de la empresa", is_system: true, permissions: ["sales.invoice.view", "sales.invoice.issue", "org.members.manage"] }),
  role({ id: 3, name: "seller", description: "Vendedor: factura", members_count: 3, organizations_count: 2, permissions: ["sales.invoice.issue"] }),
  role({ id: 4, name: "cajero", description: "Cajero: cobra", permissions: ["sales.invoice.view"] }),
];
const catalog = [
  { name: "sales.invoice.view", module: "sales", description: "Ver comprobantes" },
  { name: "sales.invoice.issue", module: "sales", description: "Emitir comprobantes" },
  { name: "org.members.manage", module: "org", description: "Administrar las personas de la empresa" },
];

const rowOf = (name: string) => screen.getByText(name, { selector: "p" }).closest("tr") as HTMLElement;

beforeEach(() => {
  systemAdmin = true;
  getRoles.mockReset().mockResolvedValue(roles);
  getPermissionCatalog.mockReset().mockResolvedValue(catalog);
  createRole.mockReset().mockResolvedValue(role());
  updateRole.mockReset().mockResolvedValue(role());
  deleteRole.mockReset().mockResolvedValue(null);
});

describe("Roles (administración del sistema)", () => {
  it("quien no es administradora del sistema ve el aviso y no se consulta nada", async () => {
    systemAdmin = false;
    render(<Roles />);

    expect(await screen.findByText("No tenés permiso para ver esta pantalla")).toBeTruthy();
    expect(getRoles).not.toHaveBeenCalled();
  });

  it("lista los roles con su nombre corto, tipo, cantidad de permisos y uso en las empresas", async () => {
    render(<Roles />);
    await screen.findByRole("table");

    const seller = within(rowOf("seller"));
    expect(seller.getByText("Vendedor")).toBeTruthy();
    expect(seller.getByText("1 permiso")).toBeTruthy();
    expect(seller.getByText("3 personas · 2 empresas")).toBeTruthy();
    expect(within(rowOf("cajero")).getByText("Sin uso")).toBeTruthy();
    expect(within(rowOf("company_admin")).getByText("Del sistema")).toBeTruthy();
    expect(within(rowOf("company_admin")).getByText("3 permisos")).toBeTruthy();
    expect(within(rowOf("admin")).getByText("—")).toBeTruthy(); // rol global: sin permisos de empresa
    expect(screen.getByText("4 roles")).toBeTruthy();
  });

  it("los roles del sistema solo se pueden ver; los demás se editan y borran", async () => {
    render(<Roles />);
    await screen.findByRole("table");

    expect(screen.getByRole("button", { name: "Ver company_admin" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Editar company_admin" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar admin" })).toBeNull();
    expect(screen.getByRole("button", { name: "Editar seller" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eliminar cajero" })).toBeTruthy();
  });

  it("un rol del sistema se ve en solo lectura, con el motivo", async () => {
    render(<Roles />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Ver company_admin" }));
    const dialog = within(await screen.findByRole("dialog"));

    expect(dialog.getByText(/siempre tiene todos los permisos y no se puede modificar/)).toBeTruthy();
    expect(dialog.queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(dialog.getByRole("checkbox", { name: "Emitir comprobantes" }).getAttribute("data-state")).toBe("checked");
    expect(dialog.getByLabelText("Descripción")).toHaveProperty("disabled", true);
  });

  it("no se puede borrar un rol en uso: el botón está deshabilitado y explica por qué", async () => {
    render(<Roles />);
    await screen.findByRole("table");

    const button = screen.getByRole("button", { name: "Eliminar seller" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("title")).toContain("En uso: 3 personas · 2 empresas");
  });

  it("borra un rol sin uso después de confirmar", async () => {
    render(<Roles />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Eliminar cajero" }));
    const confirm = within(await screen.findByRole("alertdialog"));
    expect(deleteRole).not.toHaveBeenCalled();
    await user.click(confirm.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(deleteRole).toHaveBeenCalledWith(4));
    expect(await screen.findByText("Rol «cajero» eliminado.")).toBeTruthy();
  });

  it("si el servidor rechaza el borrado (alguien empezó a usarlo) muestra el motivo", async () => {
    deleteRole.mockRejectedValue(new Error("El rol «cajero» lo usan 1 persona en 1 empresa: cambiales el rol antes de borrarlo, o quedarían fuera de la empresa."));
    render(<Roles />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Eliminar cajero" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Eliminar" }));

    expect(await screen.findByText(/lo usan 1 persona en 1 empresa/)).toBeTruthy();
  });

  it("crea un rol: pide un nombre válido y al menos un permiso, y agrupa los permisos por módulo", async () => {
    render(<Roles />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Nuevo rol/ }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Ventas")).toBeTruthy();
    expect(dialog.getByText("Empresa")).toBeTruthy();
    expect(dialog.getByRole("button", { name: "Guardar" })).toHaveProperty("disabled", true);

    await user.type(dialog.getByLabelText("Nombre interno"), "Con Espacios");
    await user.click(dialog.getByRole("checkbox", { name: "Ver comprobantes" }));
    expect(dialog.getByRole("button", { name: "Guardar" })).toHaveProperty("disabled", true); // nombre inválido

    await user.clear(dialog.getByLabelText("Nombre interno"));
    await user.type(dialog.getByLabelText("Nombre interno"), "supervisor");
    await user.type(dialog.getByLabelText("Descripción"), "Supervisor: ve todo");
    await user.click(dialog.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(createRole).toHaveBeenCalledWith({ name: "supervisor", description: "Supervisor: ve todo", permissions: ["sales.invoice.view"] }));
    expect(await screen.findByText("Rol «supervisor» creado. Ya se puede asignar en las empresas.")).toBeTruthy();
  });

  it("«Todos» marca y desmarca todos los permisos de un módulo", async () => {
    render(<Roles />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Nuevo rol/ }));
    const dialog = within(await screen.findByRole("dialog"));

    await user.click(dialog.getByRole("checkbox", { name: "Todos los permisos de Ventas" }));
    expect(dialog.getByRole("checkbox", { name: "Ver comprobantes" }).getAttribute("data-state")).toBe("checked");
    expect(dialog.getByRole("checkbox", { name: "Emitir comprobantes" }).getAttribute("data-state")).toBe("checked");
    expect(dialog.getByRole("checkbox", { name: "Administrar las personas de la empresa" }).getAttribute("data-state")).toBe("unchecked");
    expect(dialog.getByText("Permisos (2)")).toBeTruthy();

    await user.click(dialog.getByRole("checkbox", { name: "Todos los permisos de Ventas" }));
    expect(dialog.getByText("Permisos (0)")).toBeTruthy();
  });

  it("edita los permisos de un rol y avisa cuando está en uso", async () => {
    render(<Roles />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Editar seller" }));
    const dialog = within(await screen.findByRole("dialog"));

    expect(dialog.getByText(/Este rol lo usan 3 personas · 2 empresas/)).toBeTruthy();
    expect(dialog.queryByLabelText("Nombre interno")).toBeNull(); // el nombre no se cambia
    expect(dialog.getByRole("checkbox", { name: "Emitir comprobantes" }).getAttribute("data-state")).toBe("checked");

    await user.click(dialog.getByRole("checkbox", { name: "Ver comprobantes" }));
    await user.click(dialog.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(updateRole).toHaveBeenCalledWith(3, { description: "Vendedor: factura", permissions: ["sales.invoice.issue", "sales.invoice.view"] }));
    expect(await screen.findByText("Rol «seller» actualizado.")).toBeTruthy();
  });

  it("no deja guardar un rol sin permisos y muestra el error del servidor", async () => {
    updateRole.mockRejectedValue(new Error("El rol «cajero» está en uso: no se le pueden quitar todos los permisos."));
    render(<Roles />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Editar cajero" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("checkbox", { name: "Ver comprobantes" }));
    expect(dialog.getByRole("button", { name: "Guardar" })).toHaveProperty("disabled", true);

    await user.click(dialog.getByRole("checkbox", { name: "Emitir comprobantes" }));
    await user.click(dialog.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(/no se le pueden quitar todos los permisos/)).toBeTruthy();
  });
});
