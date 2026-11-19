import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Companies from "../Companies";

const getOrganizations = vi.fn();
const createOrganization = vi.fn();
const updateOrganization = vi.fn();
let systemAdmin = true;

vi.mock("../../services/teamService", () => ({
  getOrganizations: (...a: unknown[]) => getOrganizations(...a),
  createOrganization: (...a: unknown[]) => createOrganization(...a),
  updateOrganization: (...a: unknown[]) => updateOrganization(...a),
}));
vi.mock("../../hooks/useSystemAdmin", () => ({ useSystemAdmin: () => systemAdmin }));

const orgs = [
  { id: 1, name: "A SA", tax_id: "30711111119", is_active: true, members_count: 2 },
  { id: 2, name: "B SRL", tax_id: null, is_active: false, members_count: 1 },
];

beforeEach(() => {
  systemAdmin = true;
  getOrganizations.mockReset().mockResolvedValue(orgs);
  createOrganization.mockReset().mockResolvedValue(orgs[0]);
  updateOrganization.mockReset().mockResolvedValue(orgs[0]);
});

describe("Empresas (administración del sistema)", () => {
  it("quien no es administradora del sistema ve el aviso y no se consulta nada", async () => {
    systemAdmin = false;
    render(<Companies />);

    expect(await screen.findByText("No tenés permiso para ver esta pantalla")).toBeTruthy();
    expect(getOrganizations).not.toHaveBeenCalled();
  });

  it("lista las empresas con CUIT, personas y estado", async () => {
    render(<Companies />);

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("A SA")).toBeTruthy();
    expect(table.getByText("30711111119")).toBeTruthy();
    expect(table.getByText("Activa")).toBeTruthy();
    expect(table.getByText("De baja")).toBeTruthy();
    expect(table.getByText("—")).toBeTruthy();
  });

  it("crea una empresa con su administrador", async () => {
    render(<Companies />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Nueva empresa/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Nombre"), "Nueva SRL");
    await user.type(dialog.getByLabelText("CUIT (opcional)"), "30711111119");
    await user.type(dialog.getByLabelText("Email de quien administra"), "dueno@ejemplo.com");
    await user.click(dialog.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(createOrganization).toHaveBeenCalledWith({ name: "Nueva SRL", tax_id: "30711111119", admin_email: "dueno@ejemplo.com" }));
    expect(await screen.findByText("Empresa creada.")).toBeTruthy();
  });

  it("si el administrador todavía no tiene cuenta avisa que se lo invitó por email", async () => {
    createOrganization.mockResolvedValue({ ...orgs[0], admin_status: "invited", email_sent: true });
    render(<Companies />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Nueva empresa/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Nombre"), "Nueva SRL");
    await user.type(dialog.getByLabelText("Email de quien administra"), "dueno@ejemplo.com");
    await user.click(dialog.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Empresa creada. Se invitó por email a dueno@ejemplo.com para que la administre.")).toBeTruthy();
  });

  it("muestra el motivo si el alta falla (por ejemplo, un CUIT repetido)", async () => {
    createOrganization.mockRejectedValue(new Error("El CUIT ya está en uso."));
    render(<Companies />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Nueva empresa/ }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText("Nombre"), "X");
    await user.type(dialog.getByLabelText("Email de quien administra"), "a@b.com");
    await user.click(dialog.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("El CUIT ya está en uso.")).toBeTruthy();
  });

  it("edita el nombre y el CUIT sin pedir administrador", async () => {
    render(<Companies />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Editar B SRL" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.queryByLabelText("Email de quien administra")).toBeNull();
    await user.clear(dialog.getByLabelText("Nombre"));
    await user.type(dialog.getByLabelText("Nombre"), "B Renombrada");
    await user.click(dialog.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(updateOrganization).toHaveBeenCalledWith(2, { name: "B Renombrada", tax_id: null }));
  });

  it("dar de baja pide confirmación; reactivar es directo", async () => {
    render(<Companies />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Dar de baja A SA" }));
    expect(updateOrganization).not.toHaveBeenCalled();
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Dar de baja" }));
    await waitFor(() => expect(updateOrganization).toHaveBeenCalledWith(1, { is_active: false }));

    updateOrganization.mockClear();
    await user.click(await screen.findByRole("button", { name: "Reactivar B SRL" }));
    await waitFor(() => expect(updateOrganization).toHaveBeenCalledWith(2, { is_active: true }));
  });
});
