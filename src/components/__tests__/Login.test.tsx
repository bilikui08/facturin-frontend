import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "../Login";

const login = vi.fn();
const selectOrganization = vi.fn();
const getBranding = vi.fn();

vi.mock("../../services/systemService", () => ({ getBranding: (...args: unknown[]) => getBranding(...args) }));

vi.mock("../../services/authService", () => ({
  login: (...args: unknown[]) => login(...args),
  selectOrganization: (...args: unknown[]) => selectOrganization(...args),
}));

describe("Login", () => {
  beforeEach(() => {
    login.mockReset();
    selectOrganization.mockReset();
    getBranding.mockReset().mockResolvedValue(null);
  });

  it("muestra el nombre del sistema configurado, no uno fijo", async () => {
    getBranding.mockResolvedValue("Mi ERP");
    render(<Login onLoginSuccess={vi.fn()} />);

    expect(await screen.findByText("Mi ERP")).toBeTruthy();
    expect(screen.getByText("Panel de Mi ERP")).toBeTruthy();
    expect(screen.queryByText("Facturín")).toBeNull();
  });

  it("si no se puede consultar el nombre igual se puede ingresar", async () => {
    render(<Login onLoginSuccess={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Ingresar" })).toBeTruthy();
    expect(screen.queryByText(/Panel de/)).toBeNull();
  });

  it("envía email, contraseña y la opción recordarme", async () => {
    login.mockResolvedValue(undefined);
    const onLoginSuccess = vi.fn();
    render(<Login onLoginSuccess={onLoginSuccess} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "yo@ejemplo.com");
    await user.type(screen.getByLabelText("Contraseña"), "secreta123");
    await user.click(screen.getByLabelText("Recordarme"));
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
    expect(login).toHaveBeenCalledWith("yo@ejemplo.com", "secreta123", true);
  });

  it("muestra el error y no ingresa si las credenciales son inválidas", async () => {
    login.mockRejectedValue(new Error("Las credenciales ingresadas no son válidas."));
    const onLoginSuccess = vi.fn();
    render(<Login onLoginSuccess={onLoginSuccess} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "yo@ejemplo.com");
    await user.type(screen.getByLabelText("Contraseña"), "mala");
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText("Las credenciales ingresadas no son válidas.")).toBeTruthy();
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });

  describe("con varias empresas", () => {
    const pending = {
      kind: "select-organization",
      selectionToken: "sel-1",
      organizations: [{ id: 1, name: "A SA" }, { id: 2, name: "B SRL" }],
    };

    const submitCredentials = async (user: ReturnType<typeof userEvent.setup>, remember = false) => {
      await user.type(screen.getByLabelText("Email"), "yo@ejemplo.com");
      await user.type(screen.getByLabelText("Contraseña"), "secreta123");
      if (remember) await user.click(screen.getByLabelText("Recordarme"));
      await user.click(screen.getByRole("button", { name: "Ingresar" }));
    };

    it("después de validar las credenciales pide elegir la empresa y no ingresa todavía", async () => {
      login.mockResolvedValue(pending);
      const onLoginSuccess = vi.fn();
      render(<Login onLoginSuccess={onLoginSuccess} />);

      await submitCredentials(userEvent.setup());

      expect(await screen.findByText("Elegí la empresa")).toBeTruthy();
      const list = within(screen.getByRole("list", { name: "Empresas" }));
      expect(list.getByRole("button", { name: "A SA" })).toBeTruthy();
      expect(list.getByRole("button", { name: "B SRL" })).toBeTruthy();
      expect(screen.queryByLabelText("Contraseña")).toBeNull();
      expect(onLoginSuccess).not.toHaveBeenCalled();
    });

    it("elegir una empresa ingresa con el permiso temporal y la opción recordarme", async () => {
      login.mockResolvedValue(pending);
      selectOrganization.mockResolvedValue(undefined);
      const onLoginSuccess = vi.fn();
      render(<Login onLoginSuccess={onLoginSuccess} />);
      const user = userEvent.setup();

      await submitCredentials(user, true);
      await user.click(await screen.findByRole("button", { name: "B SRL" }));

      await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
      expect(selectOrganization).toHaveBeenCalledWith("sel-1", 2, true);
    });

    it("si el permiso venció muestra el motivo y permite volver a las credenciales", async () => {
      login.mockResolvedValue(pending);
      selectOrganization.mockRejectedValue(new Error("La selección de empresa venció: volvé a iniciar sesión."));
      const onLoginSuccess = vi.fn();
      render(<Login onLoginSuccess={onLoginSuccess} />);
      const user = userEvent.setup();

      await submitCredentials(user);
      await user.click(await screen.findByRole("button", { name: "A SA" }));

      expect(await screen.findByText("La selección de empresa venció: volvé a iniciar sesión.")).toBeTruthy();
      expect(onLoginSuccess).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Volver" }));
      expect(screen.getByLabelText("Contraseña")).toHaveProperty("value", "");
      expect(screen.queryByText("La selección de empresa venció: volvé a iniciar sesión.")).toBeNull();
    });
  });
});
