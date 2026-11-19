import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_API_URL, BILLING_API_URL } from "../../config/api";
import { signIn, signOut } from "../../test/session";
import { apiRequest, resetForbiddenRefreshForTests } from "../apiClient";
import { readAccess } from "../access";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const b64url = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const jwtWith = (permissions: string[]) =>
  `${b64url({ alg: "RS256" })}.${b64url({ sub: "7", org: 1, permissions, jti: Math.random().toString(36).slice(2), exp: Math.floor(Date.now() / 1000) + 900 })}.firma`;

let fetchMock: ReturnType<typeof vi.fn>;
const refreshCalls = () => fetchMock.mock.calls.filter((c) => c[0] === `${AUTH_API_URL}/auth/refresh`);

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  resetForbiddenRefreshForTests();
  signIn({ organizationId: 1, permissions: [] });
});

afterEach(() => {
  signOut();
  vi.unstubAllGlobals();
});

describe("un 403 pone la interfaz al día", () => {
  it("renueva la sesión y toma los permisos nuevos, sin repetir el pedido ni cerrar la sesión", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === `${AUTH_API_URL}/auth/refresh`
        ? json(200, { success: true, data: { tokens: { token_type: "Bearer", expires_in: 900, access_token: jwtWith(["sales.invoice.issue"]), refresh_token: "ref-2" } } })
        : json(403, { success: false, message: "No tenés permiso para realizar esta acción." }),
    );

    await expect(apiRequest("/invoices")).rejects.toMatchObject({ status: 403, message: "No tenés permiso para realizar esta acción." });

    expect(refreshCalls()).toHaveLength(1);
    expect(fetchMock.mock.calls.filter((c) => c[0] === `${BILLING_API_URL}/invoices`)).toHaveLength(1); // no se reintenta
    expect(readAccess().permissions).toEqual(["sales.invoice.issue"]); // la pantalla se actualiza con los permisos nuevos
  });

  it("no encadena renovaciones: varios 403 seguidos renuevan una sola vez", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === `${AUTH_API_URL}/auth/refresh`
        ? json(200, { success: true, data: { tokens: { token_type: "Bearer", expires_in: 900, access_token: jwtWith([]), refresh_token: "ref-2" } } })
        : json(403, { success: false, message: "No tenés permiso para realizar esta acción." }),
    );

    await expect(apiRequest("/invoices")).rejects.toBeTruthy();
    await expect(apiRequest("/customers")).rejects.toBeTruthy();
    await expect(apiRequest("/trash")).rejects.toBeTruthy();

    expect(refreshCalls()).toHaveLength(1);
  });

  it("si la renovación falla por la red igual informa el 403 y conserva la sesión", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === `${AUTH_API_URL}/auth/refresh`) throw new TypeError("Failed to fetch");
      return json(403, { success: false, message: "No tenés permiso para realizar esta acción." });
    });

    await expect(apiRequest("/invoices")).rejects.toMatchObject({ status: 403 });
    expect(localStorage.getItem("access_token")).not.toBeNull();
  });

  it("un 403 no es un 401: no cierra la sesión", async () => {
    const onUnauthorized = vi.fn();
    window.addEventListener("facturin:unauthorized", onUnauthorized);
    fetchMock.mockImplementation(async (url: string) =>
      url === `${AUTH_API_URL}/auth/refresh`
        ? json(200, { success: true, data: { tokens: { token_type: "Bearer", expires_in: 900, access_token: jwtWith([]), refresh_token: "ref-2" } } })
        : json(403, { success: false, message: "x" }),
    );

    await expect(apiRequest("/invoices")).rejects.toBeTruthy();

    expect(onUnauthorized).not.toHaveBeenCalled();
    window.removeEventListener("facturin:unauthorized", onUnauthorized);
  });
});
