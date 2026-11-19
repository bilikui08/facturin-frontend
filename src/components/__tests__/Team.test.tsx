import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signIn, signOut } from "../../test/session";
import Team from "../Team";

const getMembers = vi.fn();
const getAssignableRoles = vi.fn();
const inviteMember = vi.fn();
const getInvitations = vi.fn();
const revokeInvitation = vi.fn();
const setMemberRoles = vi.fn();
const removeMember = vi.fn();

vi.mock("../../services/teamService", () => ({
  getMembers: (...a: unknown[]) => getMembers(...a),
  getAssignableRoles: (...a: unknown[]) => getAssignableRoles(...a),
  inviteMember: (...a: unknown[]) => inviteMember(...a),
  getInvitations: (...a: unknown[]) => getInvitations(...a),
  revokeInvitation: (...a: unknown[]) => revokeInvitation(...a),
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
  inviteMember.mockReset().mockResolvedValue({ status: "invited", email_sent: true, members, invitations: [] });
  getInvitations.mockReset().mockResolvedValue([]);
  revokeInvitation.mockReset().mockResolvedValue([]);
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

  it("invita a una persona por email con sus roles", async () => {
    render(<Team />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Agregar persona/ }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("button", { name: "Guardar" })).toHaveProperty("disabled", true);

    await user.type(dialog.getByLabelText("Email"), "dani@ejemplo.com");
    await user.click(dialog.getByRole("checkbox", { name: "Vendedor" }));
    await user.click(dialog.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(inviteMember).toHaveBeenCalledWith("dani@ejemplo.com", ["seller"]));
    expect(await screen.findByText("Invitación enviada a dani@ejemplo.com. Vence en 7 días.")).toBeTruthy();
    expect(getMembers).toHaveBeenCalledTimes(2); // recarga la lista
  });

  it("muestra el motivo si no se puede agregar y deja el diálogo abierto", async () => {
    inviteMember.mockRejectedValue(new Error("Esa persona ya pertenece a la empresa."));
    render(<Team />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Agregar persona/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Email"), "nadie@ejemplo.com");
    await user.click(dialog.getByRole("checkbox", { name: "Lector" }));
    await user.click(dialog.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Esa persona ya pertenece a la empresa.")).toBeTruthy();
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

  it("si el email ya tenía cuenta avisa que entró al instante", async () => {
    inviteMember.mockResolvedValue({ status: "added", email_sent: true, members, invitations: [] });
    render(<Team />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Agregar persona/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Email"), "beto@ejemplo.com");
    await user.click(dialog.getByRole("checkbox", { name: "Lector" }));
    await user.click(dialog.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("beto@ejemplo.com ya tenía cuenta: se la sumó a la empresa y se le avisó por email.")).toBeTruthy();
  });

  it("si el correo no pudo salir lo dice como error y la invitación queda para reenviar", async () => {
    inviteMember.mockResolvedValue({ status: "invited", email_sent: false, members, invitations: [] });
    render(<Team />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Agregar persona/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Email"), "dani@ejemplo.com");
    await user.click(dialog.getByRole("checkbox", { name: "Lector" }));
    await user.click(dialog.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText(/quedó guardada, pero no se pudo enviar el correo/)).toBeTruthy();
  });

  describe("invitaciones pendientes", () => {
    const pending = [{ id: 4, email: "nuevo@ejemplo.com", roles: ["seller"], invited_by: "Ana", expires_at: "2026-11-26T12:00:00-03:00", created_at: "2026-11-19T12:00:00-03:00" }];

    it("se listan con quién invitó y cuándo vencen; sin pendientes no hay sección", async () => {
      const { unmount } = render(<Team />);
      await screen.findByRole("table");
      expect(screen.queryByText("Invitaciones pendientes")).toBeNull();
      unmount();

      getInvitations.mockResolvedValue(pending);
      render(<Team />);

      expect(await screen.findByText("Invitaciones pendientes")).toBeTruthy();
      expect(screen.getByText("nuevo@ejemplo.com")).toBeTruthy();
    });

    it("reenviar vuelve a invitar al mismo email con los mismos roles", async () => {
      getInvitations.mockResolvedValue(pending);
      render(<Team />);
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      await user.click(await screen.findByRole("button", { name: "Reenviar la invitación a nuevo@ejemplo.com" }));

      await waitFor(() => expect(inviteMember).toHaveBeenCalledWith("nuevo@ejemplo.com", ["seller"]));
      expect(await screen.findByText("Invitación enviada a nuevo@ejemplo.com. Vence en 7 días.")).toBeTruthy();
    });

    it("cancelar anula la invitación", async () => {
      getInvitations.mockResolvedValue(pending);
      render(<Team />);
      const user = userEvent.setup({ pointerEventsCheck: 0 });

      await user.click(await screen.findByRole("button", { name: "Cancelar la invitación a nuevo@ejemplo.com" }));

      await waitFor(() => expect(revokeInvitation).toHaveBeenCalledWith(4));
      expect(await screen.findByText("Invitación a nuevo@ejemplo.com cancelada.")).toBeTruthy();
    });
  });
});
