import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPassword from "../ForgotPassword";
import ResetPassword from "../ResetPassword";

const requestPasswordReset = vi.fn();
const checkPasswordReset = vi.fn();
const resetPassword = vi.fn();

vi.mock("../../services/authService", () => ({
  requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...a),
  checkPasswordReset: (...a: unknown[]) => checkPasswordReset(...a),
  resetPassword: (...a: unknown[]) => resetPassword(...a),
}));

beforeEach(() => {
  requestPasswordReset.mockReset().mockResolvedValue("ok");
  checkPasswordReset.mockReset().mockResolvedValue(undefined);
  resetPassword.mockReset().mockResolvedValue("ok");
});

describe("Olvidé mi contraseña", () => {
  const renderForgot = () =>
    render(
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <ForgotPassword />
      </MemoryRouter>,
    );

  it("pide el email y muestra siempre el mismo aviso, sin revelar si la cuenta existe", async () => {
    renderForgot();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "  ana@example.com ");
    await user.click(screen.getByRole("button", { name: "Enviarme el enlace" }));

    expect(await screen.findByText(/Si el correo está registrado, vas a recibir un enlace/)).toBeTruthy();
    expect(requestPasswordReset).toHaveBeenCalledWith("ana@example.com");
  });

  it("no envía sin email y muestra el error del servidor (por ejemplo, demasiados intentos)", async () => {
    requestPasswordReset.mockRejectedValue(new Error("Hiciste demasiados intentos. Esperá un minuto y probá de nuevo."));
    renderForgot();
    const user = userEvent.setup();

    expect((screen.getByRole("button", { name: "Enviarme el enlace" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText("Email"), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Enviarme el enlace" }));

    expect(await screen.findByText(/demasiados intentos/)).toBeTruthy();
  });
});

describe("Elegir la contraseña nueva", () => {
  const renderReset = (url = "/reset-password?token=tok-123&email=ana%40example.com") =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <ResetPassword />
      </MemoryRouter>,
    );

  const fill = async (user: ReturnType<typeof userEvent.setup>, password = "ClaveNueva9", confirmation = password) => {
    await user.type(await screen.findByLabelText("Contraseña nueva"), password);
    await user.type(screen.getByLabelText("Repetí la contraseña"), confirmation);
  };

  it("verifica el enlace al abrir y muestra para qué cuenta es", async () => {
    renderReset();

    expect(await screen.findByText("Elegí tu contraseña nueva")).toBeTruthy();
    expect(screen.getByText("ana@example.com")).toBeTruthy();
    expect(checkPasswordReset.mock.calls[0].slice(0, 2)).toEqual(["ana@example.com", "tok-123"]);
  });

  it("cambia la contraseña y manda a iniciar sesión", async () => {
    renderReset();
    const user = userEvent.setup();

    await fill(user);
    await user.click(screen.getByRole("button", { name: "Cambiar la contraseña" }));

    expect(await screen.findByText("Contraseña actualizada")).toBeTruthy();
    expect(resetPassword).toHaveBeenCalledWith({ email: "ana@example.com", token: "tok-123", password: "ClaveNueva9", password_confirmation: "ClaveNueva9" });
    expect(screen.getByRole("link", { name: "Ir a iniciar sesión" }).getAttribute("href")).toBe("/");
  });

  it("no manda la contraseña si es corta o no coincide", async () => {
    renderReset();
    const user = userEvent.setup();

    await fill(user, "corta");
    await user.click(screen.getByRole("button", { name: "Cambiar la contraseña" }));
    expect(await screen.findByText("La contraseña debe tener al menos 8 caracteres.")).toBeTruthy();

    await user.clear(screen.getByLabelText("Contraseña nueva"));
    await user.clear(screen.getByLabelText("Repetí la contraseña"));
    await user.type(screen.getByLabelText("Contraseña nueva"), "ClaveNueva9");
    await user.type(screen.getByLabelText("Repetí la contraseña"), "ClaveOtra99");
    await user.click(screen.getByRole("button", { name: "Cambiar la contraseña" }));
    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeTruthy();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("si el enlace venció avisa de entrada y ofrece pedir otro, sin mostrar el formulario", async () => {
    checkPasswordReset.mockRejectedValue(new Error("El enlace no es válido o venció. Pedí uno nuevo."));
    renderReset();

    expect(await screen.findByText("Enlace no disponible")).toBeTruthy();
    expect(screen.getByText("El enlace no es válido o venció. Pedí uno nuevo.")).toBeTruthy();
    expect(screen.queryByLabelText("Contraseña nueva")).toBeNull();
    expect(screen.getByRole("link", { name: "Pedir un enlace nuevo" }).getAttribute("href")).toBe("/forgot-password");
  });

  it("un enlace incompleto ni siquiera consulta al servidor", async () => {
    renderReset("/reset-password?token=tok-123");

    expect(await screen.findByText("El enlace está incompleto. Pedí uno nuevo.")).toBeTruthy();
    expect(checkPasswordReset).not.toHaveBeenCalled();
  });

  it("si el servidor rechaza el cambio (el enlace se usó en otra pestaña) muestra el motivo", async () => {
    resetPassword.mockRejectedValue(new Error("El enlace no es válido o venció. Pedí uno nuevo."));
    renderReset();
    const user = userEvent.setup();

    await fill(user);
    await user.click(screen.getByRole("button", { name: "Cambiar la contraseña" }));

    await waitFor(() => expect(screen.getAllByText("El enlace no es válido o venció. Pedí uno nuevo.").length).toBeGreaterThan(0));
    expect(screen.queryByText("Contraseña actualizada")).toBeNull();
  });
});
