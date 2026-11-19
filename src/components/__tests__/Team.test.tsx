import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signIn, signOut } from "../../test/session";
import Team from "../Team";

const getMembers = vi.fn();
const getAssignableRoles = vi.fn();
const addMember = vi.fn();
const setMemberRoles = vi.fn();
const removeMember = vi.fn();

vi.mock("../../services/teamService", () => ({
  getMembers: (...a: unknown[]) => getMembers(...a),
  getAssignableRoles: (...a: unknown[]) => getAssignableRoles(...a),
  addMember: (...a: unknown[]) => addMember(...a),
  setMemberRoles: (...a: unknown[]) => setMemberRoles(...a),
  removeMember: (...a: unknown[]) => removeMember(...a),
}));

const roles = [
  { name: "company_admin", description: "Administrador de la empresa", permissions: [{ name: "sales.invoice.issue", description: "Emitir comprobantes" }] },
  { name: "seller", description: "Vendedor: factura y administra clientes", permissions: [{ name: "sales.invoice.issue", description: "Emitir comprobantes" }] },
  { name: "viewer", description: "Lector: solo consulta", permissions: [{ name: "sales.invoice.view", description: "Ver comprobantes" }] },
];
const members = [
  { user_id: 7, name: "Ana", email: "ana@ejemplo.com", roles: ["company_admin"] },
  { user_id: 8, name: "Beto", email: "beto@ejemplo.com", roles: ["seller", "viewer"] },
];

beforeEach(() => {
  signIn({ userId: 7, organizationId: 1, permissions: ["org.members.manage"] });
  getMembers.mockReset().mockResolvedValue(members);
  getAssignableRoles.mockReset().mockResolvedValue(roles);
  addMember.mockReset().mockResolvedValue(members);
  setMemberRoles.mockReset().mockResolvedValue(members);
  removeMember.mockReset().mockResolvedValue(members);
});

afterEach(() => {
  signOut();
  localStorage.clear();
});

describe("Equipo", () => {
  it("lista las personas con su email y roles (con el nombre corto del rol) y marca a quien está usando la pantalla", async () => {
    render(<Team />);

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Ana")).toBeTruthy();
    expect(table.getByText("Vos")).toBeTruthy();
    expect(table.getByText("beto@ejemplo.com")).toBeTruthy();
    expect(table.getByText("Administrador de la empresa")).toBeTruthy();
    expect(table.getByText("Vendedor")).toBeTruthy(); // "Vendedor: factura y..." se muestra como "Vendedor"
    expect(table.getByText("Lector")).toBeTruthy();
    expect(screen.getByText("2 personas")).toBeTruthy();
  });

  it("agrega una persona con email y roles", async () => {
    render(<Team />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Agregar persona/ }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("button", { name: "Guardar" })).toHaveProperty("disabled", true);

    await user.type(dialog.getByLabelText("Email"), "dani@ejemplo.com");
    await user.click(dialog.getByRole("checkbox", { name: "Vendedor" }));
    await user.click(dialog.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(addMember).toHaveBeenCalledWith("dani@ejemplo.com", ["seller"]));
    expect(await screen.findByText("Persona agregada a la empresa.")).toBeTruthy();
    expect(getMembers).toHaveBeenCalledTimes(2); // recarga la lista
  });

  it("muestra el motivo si no se puede agregar y deja el diálogo abierto", async () => {
    addMember.mockRejectedValue(new Error("No hay ningún usuario con ese email: la persona debe registrarse primero."));
    render(<Team />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Agregar persona/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Email"), "nadie@ejemplo.com");
    await user.click(dialog.getByRole("checkbox", { name: "Lector" }));
    await user.click(dialog.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText(/la persona debe registrarse primero/)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("cambia los roles de una persona partiendo de los que tiene", async () => {
    render(<Team />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Cambiar roles de Beto" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Factura y administra clientes")).toBeTruthy();
    expect(dialog.getByText("1 permiso")).toBeTruthy(); // sin detalle en la descripción: cuenta los permisos
    expect(dialog.getByRole("checkbox", { name: "Vendedor" }).getAttribute("data-state")).toBe("checked");
    expect(dialog.getByRole("checkbox", { name: "Lector" }).getAttribute("data-state")).toBe("checked");
    expect(dialog.getByRole("checkbox", { name: "Administrador de la empresa" }).getAttribute("data-state")).toBe("unchecked");

    await user.click(dialog.getByRole("checkbox", { name: "Lector" }));
    await user.click(dialog.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(setMemberRoles).toHaveBeenCalledWith(8, ["seller"]));
    expect(await screen.findByText("Roles de Beto actualizados.")).toBeTruthy();
  });

  it("no se puede guardar sin ningún rol", async () => {
    render(<Team />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Cambiar roles de Ana" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("checkbox", { name: "Administrador de la empresa" }));

    expect(dialog.getByRole("button", { name: "Guardar" })).toHaveProperty("disabled", true);
  });

  it("quita a una persona después de confirmar", async () => {
    render(<Team />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Quitar a Beto" }));
    const confirm = within(await screen.findByRole("alertdialog"));
    expect(confirm.getByText(/¿Quitar a Beto de la empresa\?/)).toBeTruthy();
    expect(removeMember).not.toHaveBeenCalled();

    await user.click(confirm.getByRole("button", { name: "Quitar" }));

    await waitFor(() => expect(removeMember).toHaveBeenCalledWith(8));
    expect(await screen.findByText("Beto ya no pertenece a la empresa.")).toBeTruthy();
  });

  it("explica por qué no se puede quitar al último administrador", async () => {
    removeMember.mockRejectedValue(new Error("La empresa debe tener al menos un administrador: asigná ese rol a otra persona antes."));
    render(<Team />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Quitar a Ana" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Quitar" }));

    expect(await screen.findByText(/debe tener al menos un administrador/)).toBeTruthy();
  });

  it("muestra el error si no se puede cargar el equipo", async () => {
    getMembers.mockRejectedValue(new Error("No tiene permisos para realizar esta acción."));
    render(<Team />);

    expect(await screen.findByText("No tiene permisos para realizar esta acción.")).toBeTruthy();
  });
});
