import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_API_URL } from "../../config/api";
import { acceptInvitation, getInvitation, login, selectOrganization } from "../authService";
import { getMyOrganizations, switchOrganization } from "../organizationService";
import { readTokens, writeTokens } from "../tokenStore";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const tokens = (access: string, refresh: string) => ({
  token_type: "Bearer",
  expires_in: 900,
  access_token: access,
  refresh_token: refresh,
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

describe("login con empresas", () => {
  it("con una sola empresa entra directo y guarda los tokens", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, data: { organization: { id: 1, name: "A" }, tokens: tokens("acc-1", "ref-1") } }));

    const result = await login("a@b.com", "x", true);

    expect(result).toEqual({ kind: "signed-in" });
    expect(readTokens()?.accessToken).toBe("acc-1");
    expect(localStorage.getItem("access_token")).toBe("acc-1");
  });

  it("recordarme apagado guarda la sesión solo en esa pestaña", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, data: { tokens: tokens("acc-1", "ref-1") } }));

    await login("a@b.com", "x", false);

    expect(sessionStorage.getItem("access_token")).toBe("acc-1");
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("con varias empresas NO guarda nada: devuelve las empresas y el permiso temporal", async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        success: true,
        data: { requires_organization: true, selection_token: "sel-1", organizations: [{ id: 1, name: "A SA" }, { id: 2, name: "B SRL" }, { nombre: "mala" }] },
      }),
    );

    const result = await login("a@b.com", "x", true);

    expect(result).toEqual({
      kind: "select-organization",
      selectionToken: "sel-1",
      organizations: [{ id: 1, name: "A SA" }, { id: 2, name: "B SRL" }],
    });
    expect(readTokens()).toBeNull();
  });

  it("si faltan las empresas o el permiso temporal falla con un mensaje claro", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, data: { requires_organization: true, organizations: [] } }));

    await expect(login("a@b.com", "x", true)).rejects.toThrow("no devolvió las empresas");
    expect(readTokens()).toBeNull();
  });

  it("sin empresas asignadas muestra el motivo del servidor", async () => {
    fetchMock.mockResolvedValue(json(403, { success: false, message: "Tu usuario no tiene empresas asignadas. Contactá al administrador." }));

    await expect(login("a@b.com", "x", true)).rejects.toThrow("no tiene empresas asignadas");
  });

  it("elegir empresa envía el permiso temporal y guarda los tokens en el storage elegido", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, data: { organization: { id: 2, name: "B" }, tokens: tokens("acc-2", "ref-2") } }));

    await selectOrganization("sel-1", 2, false);

    expect(fetchMock.mock.calls[0][0]).toBe(`${AUTH_API_URL}/auth/select-organization`);
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ selection_token: "sel-1", organization_id: 2 });
    expect(sessionStorage.getItem("access_token")).toBe("acc-2");
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("si el permiso temporal venció informa el motivo y no guarda nada", async () => {
    fetchMock.mockResolvedValue(json(401, { success: false, message: "La selección de empresa venció: volvé a iniciar sesión." }));

    await expect(selectOrganization("viejo", 2, true)).rejects.toThrow("La selección de empresa venció");
    expect(readTokens()).toBeNull();
  });
});

describe("empresas de la sesión", () => {
  const seed = () => writeTokens({ accessToken: "acc-1", refreshToken: "ref-1", tokenType: "Bearer", expiresIn: 900 }, localStorage);

  it("lista las empresas y cuál es la actual, con el token de la sesión", async () => {
    seed();
    fetchMock.mockResolvedValue(json(200, { success: true, data: { current: 2, organizations: [{ id: 1, name: "A" }, { id: 2, name: "B" }] } }));

    const result = await getMyOrganizations();

    expect(result).toEqual({ current: 2, organizations: [{ id: 1, name: "A" }, { id: 2, name: "B" }] });
    expect(fetchMock.mock.calls[0][0]).toBe(`${AUTH_API_URL}/auth/organizations`);
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get("Authorization")).toBe("Bearer acc-1");
  });

  it("current es null en una sesión anterior a las empresas", async () => {
    seed();
    fetchMock.mockResolvedValue(json(200, { success: true, data: { current: null, organizations: [{ id: 1, name: "A" }] } }));

    expect((await getMyOrganizations()).current).toBeNull();
  });

  it("falla con el mensaje del servidor si no se pueden cargar", async () => {
    seed();
    fetchMock.mockResolvedValue(json(500, { success: false, message: "Ocurrió un error interno." }));

    await expect(getMyOrganizations()).rejects.toThrow("Ocurrió un error interno.");
  });

  it("cambia de empresa con el refresh token y guarda los tokens nuevos de inmediato", async () => {
    seed();
    fetchMock.mockResolvedValue(json(200, { success: true, data: { organization: { id: 2, name: "B" }, tokens: tokens("acc-2", "ref-2") } }));

    await switchOrganization(2);

    expect(fetchMock.mock.calls[0][0]).toBe(`${AUTH_API_URL}/auth/switch-organization`);
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ refresh_token: "ref-1", organization_id: 2 });
    expect(readTokens()).toMatchObject({ accessToken: "acc-2", refreshToken: "ref-2" });
    expect(localStorage.getItem("access_token")).toBe("acc-2");
  });

  it("si el cambio falla conserva la sesión actual y muestra el motivo", async () => {
    seed();
    fetchMock.mockResolvedValue(json(401, { success: false, message: "Ya no pertenecés a la empresa de esta sesión: iniciá sesión de nuevo." }));

    await expect(switchOrganization(9)).rejects.toThrow("Ya no pertenecés a la empresa");
    expect(readTokens()?.accessToken).toBe("acc-1");
  });

  it("sin refresh token (sesión vieja) pide volver a iniciar sesión sin llamar al servidor", async () => {
    writeTokens({ accessToken: "acc-1", refreshToken: null, tokenType: "Bearer", expiresIn: 900 }, localStorage);

    await expect(switchOrganization(2)).rejects.toThrow("volvé a iniciar sesión");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("invitaciones (pantalla pública)", () => {
  it("consulta la invitación con el token del enlace (codificado)", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, data: { email: "a@b.com", organization: "A", invited_by: "Ana", roles: [], expires_at: "x" } }));

    const info = await getInvitation("tok/con+raros");

    expect(info.organization).toBe("A");
    expect(fetchMock.mock.calls[0][0]).toBe(`${AUTH_API_URL}/auth/invitations/tok%2Fcon%2Braros`);
  });

  it("una invitación inválida falla con el mensaje del servidor", async () => {
    fetchMock.mockResolvedValue(json(404, { success: false, message: "La invitación no es válida o venció. Pedí que te inviten de nuevo." }));

    await expect(getInvitation("x")).rejects.toThrow("La invitación no es válida o venció");
  });

  it("aceptar crea la cuenta y guarda la sesión (solo en esa pestaña por defecto)", async () => {
    fetchMock.mockResolvedValue(json(201, { success: true, data: { status: "created", organization: { id: 1, name: "A" }, tokens: tokens("acc-9", "ref-9") } }));

    const result = await acceptInvitation("tok", { name: "Nueva", password: "password123", password_confirmation: "password123" }, false);

    expect(result).toBe("created");
    expect(bodyOf(fetchMock.mock.calls[0])).toEqual({ name: "Nueva", password: "password123", password_confirmation: "password123" });
    expect(sessionStorage.getItem("access_token")).toBe("acc-9");
  });

  it("si el email ya tenía cuenta no guarda ninguna sesión", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, data: { status: "existing_user" } }));

    expect(await acceptInvitation("tok", { name: "x", password: "password123", password_confirmation: "password123" }, false)).toBe("existing_user");
    expect(readTokens()).toBeNull();
  });

  it("muestra el primer error de validación del servidor", async () => {
    fetchMock.mockResolvedValue(json(422, { success: false, message: "Los datos enviados no son válidos.", errors: { name: ["Ese nombre ya está en uso: elegí otro."] } }));

    await expect(acceptInvitation("tok", { name: "Ana", password: "password123", password_confirmation: "password123" }, false)).rejects.toThrow("Ese nombre ya está en uso");
    expect(readTokens()).toBeNull();
  });
});
