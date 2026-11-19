import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AcceptInvitation from "../AcceptInvitation";

const getInvitation = vi.fn();
const acceptInvitation = vi.fn();

vi.mock("../../services/authService", () => ({
  getInvitation: (...a: unknown[]) => getInvitation(...a),
  acceptInvitation: (...a: unknown[]) => acceptInvitation(...a),
}));

const info = {
  email: "nueva@ejemplo.com",
  organization: "Empresa A SA",
  invited_by: "Ana",
  roles: [{ name: "seller", description: "Vendedor: factura y administra clientes" }],
  expires_at: "2026-11-26T12:00:00-03:00",
};

const renderAt = (url = "/accept-invitation?token=tok-123", onAccepted = vi.fn()) => {
  render(
    <MemoryRouter initialEntries={[url]}>
      <AcceptInvitation onAccepted={onAccepted} />
    </MemoryRouter>,
  );
  return onAccepted;
};

const fill = async (user: ReturnType<typeof userEvent.setup>, name = "Nueva Persona", password = "password123", confirmation = password) => {
  await user.type(await screen.findByLabelText("Tu nombre"), name);
  await user.type(screen.getByLabelText("Contraseña"), password);
  await user.type(screen.getByLabelText("Repetí la contraseña"), confirmation);
};

beforeEach(() => {
  getInvitation.mockReset().mockResolvedValue(info);
  acceptInvitation.mockReset().mockResolvedValue("created");
});

describe("Aceptar invitación", () => {
  it("muestra a qué empresa, con qué email y con qué rol te invitaron", async () => {
    renderAt();

    expect(await screen.findByText("Te invitaron a Empresa A SA")).toBeTruthy();
    expect(screen.getByText("nueva@ejemplo.com")).toBeTruthy();
    expect(screen.getByText(/Ana te invitó/)).toBeTruthy();
    expect(screen.getByText("Vendedor")).toBeTruthy();
    expect(getInvitation.mock.calls[0][0]).toBe("tok-123");
  });

  it("crea la cuenta con nombre y contraseña y entra", async () => {
    const onAccepted = renderAt();
    const user = userEvent.setup();

    await fill(user);
    await user.click(screen.getByRole("button", { name: "Crear mi cuenta" }));

    await waitFor(() => expect(onAccepted).toHaveBeenCalled());
    expect(acceptInvitation).toHaveBeenCalledWith("tok-123", { name: "Nueva Persona", password: "password123", password_confirmation: "password123" }, false);
  });

  it("valida la contraseña antes de llamar al servidor", async () => {
    renderAt();
    const user = userEvent.setup();

    await fill(user, "Nueva", "corta");
    await user.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
    expect(await screen.findByText("La contraseña debe tener al menos 8 caracteres.")).toBeTruthy();

    await user.clear(screen.getByLabelText("Contraseña"));
    await user.clear(screen.getByLabelText("Repetí la contraseña"));
    await user.type(screen.getByLabelText("Contraseña"), "password123");
    await user.type(screen.getByLabelText("Repetí la contraseña"), "otra-distinta");
    await user.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
    expect(await screen.findByText("Las contraseñas no coinciden.")).toBeTruthy();

    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("muestra el error del servidor (por ejemplo un nombre ya usado) y no entra", async () => {
    acceptInvitation.mockRejectedValue(new Error("Ese nombre ya está en uso: elegí otro."));
    const onAccepted = renderAt();
    const user = userEvent.setup();

    await fill(user);
    await user.click(screen.getByRole("button", { name: "Crear mi cuenta" }));

    expect(await screen.findByText("Ese nombre ya está en uso: elegí otro.")).toBeTruthy();
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("si el email ya tenía cuenta lo dice y manda a ingresar con la contraseña de siempre", async () => {
    acceptInvitation.mockResolvedValue("existing_user");
    const onAccepted = renderAt();
    const user = userEvent.setup();

    await fill(user);
    await user.click(screen.getByRole("button", { name: "Crear mi cuenta" }));

    expect(await screen.findByText("Ya tenías una cuenta")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ingresar con mi contraseña" }).getAttribute("href")).toBe("/");
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("una invitación inválida o vencida muestra el motivo y un enlace al inicio, sin formulario", async () => {
    getInvitation.mockRejectedValue(new Error("La invitación no es válida o venció. Pedí que te inviten de nuevo."));
    renderAt();

    expect(await screen.findByText("La invitación no es válida o venció. Pedí que te inviten de nuevo.")).toBeTruthy();
    expect(screen.queryByLabelText("Tu nombre")).toBeNull();
    expect(screen.getByRole("link", { name: "Ir al inicio" })).toBeTruthy();
  });

  it("un enlace sin token no consulta al servidor", async () => {
    renderAt("/accept-invitation");

    expect(await screen.findByText("El enlace de la invitación está incompleto.")).toBeTruthy();
    expect(getInvitation).not.toHaveBeenCalled();
  });
});
