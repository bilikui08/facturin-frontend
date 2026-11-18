import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "../Login";

const login = vi.fn();

vi.mock("../../services/authService", () => ({
  login: (...args: unknown[]) => login(...args),
}));

describe("Login", () => {
  beforeEach(() => {
    login.mockReset();
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
});
