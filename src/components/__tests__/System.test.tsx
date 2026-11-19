import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import System from "../System";

const getSystemSettings = vi.fn();
const updateSystemName = vi.fn();
let systemAdmin = true;

vi.mock("../../services/systemService", () => ({
  getSystemSettings: (...a: unknown[]) => getSystemSettings(...a),
  updateSystemName: (...a: unknown[]) => updateSystemName(...a),
}));
vi.mock("../../hooks/useSystemAdmin", () => ({ useSystemAdmin: () => systemAdmin }));

const settings = (extra = {}) => ({ system_name: "Sistema de gestión", default_system_name: "Sistema de gestión", is_default: true, max_length: 60, ...extra });

beforeEach(() => {
  systemAdmin = true;
  getSystemSettings.mockReset().mockResolvedValue(settings());
  updateSystemName.mockReset().mockResolvedValue(settings({ system_name: "Mi ERP", is_default: false }));
});

describe("Sistema", () => {
  it("quien no es administradora del sistema ve el aviso y no se consulta nada", async () => {
    systemAdmin = false;
    render(<System />);

    expect(await screen.findByText("No tenés permiso para ver esta pantalla")).toBeTruthy();
    expect(getSystemSettings).not.toHaveBeenCalled();
  });

  it("muestra el nombre actual, el de por defecto y aclara que el correo se configura en el servidor", async () => {
    render(<System />);

    expect(((await screen.findByLabelText("Nombre")) as HTMLInputElement).value).toBe("Sistema de gestión");
    expect(screen.getByText(/Por defecto: Sistema de gestión/)).toBeTruthy();
    expect(screen.getByText(/se configuran en el servidor/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /Usar el nombre por defecto/ })).toHaveProperty("disabled", true);
  });

  it("guarda el nombre nuevo", async () => {
    render(<System />);
    const user = userEvent.setup();

    const input = await screen.findByLabelText("Nombre");
    await user.clear(input);
    await user.type(input, "  Mi ERP ");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateSystemName).toHaveBeenCalledWith("Mi ERP"));
    expect(await screen.findByText("Ajustes guardados.")).toBeTruthy();
  });

  it("vaciar el nombre vuelve al de por defecto", async () => {
    getSystemSettings.mockResolvedValue(settings({ system_name: "Mi ERP", is_default: false }));
    render(<System />);
    const user = userEvent.setup();

    await user.clear(await screen.findByLabelText("Nombre"));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateSystemName).toHaveBeenCalledWith(null));
  });

  it("«Usar el nombre por defecto» lo restaura de una", async () => {
    getSystemSettings.mockResolvedValue(settings({ system_name: "Mi ERP", is_default: false }));
    render(<System />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /Usar el nombre por defecto/ }));

    await waitFor(() => expect(updateSystemName).toHaveBeenCalledWith(null));
  });

  it("muestra el motivo si no se puede guardar", async () => {
    updateSystemName.mockRejectedValue(new Error("El nombre no puede llevar HTML ni caracteres de control."));
    render(<System />);
    const user = userEvent.setup();

    const input = await screen.findByLabelText("Nombre");
    await user.clear(input);
    await user.type(input, "Otro");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("El nombre no puede llevar HTML ni caracteres de control.")).toBeTruthy();
  });
});
