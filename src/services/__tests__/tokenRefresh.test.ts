import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_API_URL, BILLING_API_URL } from "../../config/api";
import { UNAUTHORIZED_EVENT, apiRequest } from "../apiClient";
import { hasAccessToken, login, logout, refreshSession } from "../authService";
import { jwtExpiry, readTokens, writeTokens } from "../tokenStore";

// --- utilidades ------------------------------------------------------------

const b64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

/** JWT de mentira con vencimiento relativo a ahora; el jti aleatorio lo hace único. */
const fakeJwt = (expiresInSeconds: number): string =>
  `${b64url({ alg: "RS256" })}.${b64url({
    sub: "1",
    jti: Math.random().toString(36).slice(2),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  })}.firma`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const tokenResponse = (access: string, refresh: string) =>
  json(200, {
    success: true,
    message: "ok",
    data: {
      tokens: { token_type: "Bearer", expires_in: 900, access_token: access, refresh_token: refresh },
    },
  });

const seed = (access: string, refresh: string | null = "refresh-1", storage: Storage = localStorage) =>
  writeTokens({ accessToken: access, refreshToken: refresh, tokenType: "Bearer", expiresIn: 900 }, storage);

const REFRESH_URL = `${AUTH_API_URL}/auth/refresh`;
const LOGOUT_URL = `${AUTH_API_URL}/auth/logout`;
const ITEMS_URL = `${BILLING_API_URL}/items`;

const bearer = (call: unknown[]): string | null =>
  new Headers((call[1] as RequestInit).headers).get("Authorization");

const callsTo = (fetchMock: ReturnType<typeof vi.fn>, url: string) =>
  fetchMock.mock.calls.filter((call) => call[0] === url);

let fetchMock: ReturnType<typeof vi.fn>;
let unauthorized: ReturnType<typeof vi.fn<(event: Event) => void>>;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  unauthorized = vi.fn<(event: Event) => void>();
  window.addEventListener(UNAUTHORIZED_EVENT, unauthorized);
});

afterEach(() => {
  window.removeEventListener(UNAUTHORIZED_EVENT, unauthorized);
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
});

// --- almacén de tokens -----------------------------------------------------

describe("tokenStore", () => {
  it("lee el vencimiento del claim exp de un JWT", () => {
    const jwt = fakeJwt(600);
    expect(jwtExpiry(jwt)).toBeGreaterThan(Date.now() + 590_000);
    expect(jwtExpiry(jwt)).toBeLessThan(Date.now() + 610_000);
    expect(jwtExpiry("no-es-un-jwt")).toBeNull();
  });

  it("usa expires_in cuando el token no es un JWT legible", () => {
    writeTokens({ accessToken: "opaco", refreshToken: "r", expiresIn: 900 }, localStorage);
    const expiresAt = readTokens()?.expiresAt ?? 0;
    expect(expiresAt).toBeGreaterThan(Date.now() + 890_000);
  });

  it("al guardar en un storage limpia el otro (sin sesiones duplicadas)", () => {
    seed(fakeJwt(900), "r1", localStorage);
    seed(fakeJwt(900), "r2", sessionStorage);
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(sessionStorage.getItem("refresh_token")).toBe("r2");
  });
});

// --- login y logout --------------------------------------------------------

describe("login", () => {
  it("guarda access y refresh token con su vencimiento", async () => {
    const access = fakeJwt(900);
    fetchMock.mockResolvedValueOnce(
      json(200, {
        success: true,
        data: { user: { id: 1 }, tokens: { token_type: "Bearer", expires_in: 900, access_token: access, refresh_token: "r1" } },
      }),
    );

    await login("a@b.com", "x", true);

    expect(localStorage.getItem("access_token")).toBe(access);
    expect(localStorage.getItem("refresh_token")).toBe("r1");
    expect(Number(localStorage.getItem("expires_at"))).toBeGreaterThan(Date.now());
    expect(hasAccessToken()).toBe(true);
  });

  it("sin 'recordarme' guarda todo en sessionStorage", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse(fakeJwt(900), "r1").clone());
    await login("a@b.com", "x", false);
    expect(sessionStorage.getItem("refresh_token")).toBe("r1");
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("falla con un mensaje claro si las credenciales son incorrectas", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { success: false, message: "Las credenciales ingresadas no son válidas." }));
    await expect(login("a@b.com", "mal", true)).rejects.toThrow("Las credenciales ingresadas no son válidas.");
    expect(hasAccessToken()).toBe(false);
  });
});

describe("logout", () => {
  it("cierra la sesión local y revoca los tokens en el servidor con el token que tenía", async () => {
    const access = fakeJwt(900);
    seed(access);
    fetchMock.mockResolvedValue(json(200, { success: true }));

    logout();

    expect(hasAccessToken()).toBe(false);
    const calls = callsTo(fetchMock, LOGOUT_URL);
    expect(calls).toHaveLength(1);
    expect(bearer(calls[0])).toBe(`Bearer ${access}`);
  });

  it("no hace ningún pedido si no hay sesión", () => {
    logout();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si falla la revocación en el servidor, igual queda cerrada la sesión local", async () => {
    seed(fakeJwt(900));
    fetchMock.mockRejectedValue(new TypeError("sin red"));
    expect(() => logout()).not.toThrow();
    expect(hasAccessToken()).toBe(false);
  });
});

// --- renovación a través de apiRequest ---------------------------------------

describe("apiRequest: renovación del token", () => {
  it("con un token vigente no renueva y lo manda como Bearer", async () => {
    const access = fakeJwt(600);
    seed(access);
    fetchMock.mockResolvedValueOnce(json(200, { success: true, data: [1] }));

    await expect(apiRequest("/items")).resolves.toEqual([1]);

    expect(callsTo(fetchMock, REFRESH_URL)).toHaveLength(0);
    expect(bearer(callsTo(fetchMock, ITEMS_URL)[0])).toBe(`Bearer ${access}`);
  });

  it("renueva ANTES de pedir cuando el token vence en menos de un minuto", async () => {
    seed(fakeJwt(20), "refresh-1");
    const renewed = fakeJwt(900);
    fetchMock.mockImplementation(async (url: string) =>
      url === REFRESH_URL ? tokenResponse(renewed, "refresh-2") : json(200, { success: true, data: "ok" }),
    );

    await apiRequest("/items");

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([REFRESH_URL, ITEMS_URL]);
    expect(bearer(callsTo(fetchMock, ITEMS_URL)[0])).toBe(`Bearer ${renewed}`);
    expect(localStorage.getItem("refresh_token")).toBe("refresh-2");
  });

  it("ante un 401 renueva una vez y repite el pedido con el token nuevo", async () => {
    seed(fakeJwt(600), "refresh-1");
    const renewed = fakeJwt(900);
    let itemsCalls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === REFRESH_URL) return tokenResponse(renewed, "refresh-2");
      itemsCalls += 1;
      return itemsCalls === 1 ? json(401, { success: false, message: "No autenticado." }) : json(200, { success: true, data: "ok" });
    });

    await expect(apiRequest("/items")).resolves.toBe("ok");

    expect(callsTo(fetchMock, REFRESH_URL)).toHaveLength(1);
    expect(callsTo(fetchMock, ITEMS_URL)).toHaveLength(2);
    expect(bearer(callsTo(fetchMock, ITEMS_URL)[1])).toBe(`Bearer ${renewed}`);
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("repite el pedido UNA sola vez: si sigue en 401 cierra la sesión (sin bucle)", async () => {
    seed(fakeJwt(600), "refresh-1");
    fetchMock.mockImplementation(async (url: string) =>
      url === REFRESH_URL ? tokenResponse(fakeJwt(900), "refresh-2") : json(401, { success: false, message: "No autenticado." }),
    );

    await expect(apiRequest("/items")).rejects.toThrow("No autenticado.");

    expect(callsTo(fetchMock, ITEMS_URL)).toHaveLength(2);
    expect(callsTo(fetchMock, REFRESH_URL)).toHaveLength(1);
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  it("si el refresh token es rechazado, limpia la sesión y avisa para cerrar sesión", async () => {
    seed(fakeJwt(600), "refresh-vencido");
    fetchMock.mockImplementation(async (url: string) =>
      url === REFRESH_URL
        ? json(401, { success: false, message: "El refresh token es inválido, expiró o ya fue utilizado." })
        : json(401, { success: false, message: "No autenticado." }),
    );

    await expect(apiRequest("/items")).rejects.toThrow();

    expect(hasAccessToken()).toBe(false);
    expect(unauthorized).toHaveBeenCalled();
    expect(callsTo(fetchMock, ITEMS_URL)).toHaveLength(1); // no se repite sin sesión
  });

  it("una sesión vieja sin refresh token cierra la sesión directamente en el 401", async () => {
    seed(fakeJwt(600), null);
    fetchMock.mockResolvedValue(json(401, { success: false, message: "No autenticado." }));

    await expect(apiRequest("/items")).rejects.toThrow();

    expect(callsTo(fetchMock, REFRESH_URL)).toHaveLength(0);
    expect(unauthorized).toHaveBeenCalled();
  });

  it("varios pedidos a la vez con el token por vencer hacen UNA sola renovación", async () => {
    seed(fakeJwt(10), "refresh-1");
    const renewed = fakeJwt(900);
    fetchMock.mockImplementation(async (url: string) => {
      if (url === REFRESH_URL) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return tokenResponse(renewed, "refresh-2");
      }
      return json(200, { success: true, data: "ok" });
    });

    await Promise.all([apiRequest("/items"), apiRequest("/items"), apiRequest("/items")]);

    expect(callsTo(fetchMock, REFRESH_URL)).toHaveLength(1);
    const itemCalls = callsTo(fetchMock, ITEMS_URL);
    expect(itemCalls).toHaveLength(3);
    itemCalls.forEach((call) => expect(bearer(call)).toBe(`Bearer ${renewed}`));
  });

  it("un error de red al renovar por adelantado no cierra la sesión: el pedido sale igual", async () => {
    const access = fakeJwt(20);
    seed(access, "refresh-1");
    fetchMock.mockImplementation(async (url: string) => {
      if (url === REFRESH_URL) throw new TypeError("sin red");
      return json(200, { success: true, data: "ok" });
    });

    await expect(apiRequest("/items")).resolves.toBe("ok");

    expect(readTokens()?.accessToken).toBe(access);
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("un error de red al renovar tras un 401 se informa pero NO cierra la sesión", async () => {
    seed(fakeJwt(600), "refresh-1");
    fetchMock.mockImplementation(async (url: string) => {
      if (url === REFRESH_URL) throw new TypeError("sin red");
      return json(401, { success: false, message: "No autenticado." });
    });

    await expect(apiRequest("/items")).rejects.toThrow("sin red");

    expect(hasAccessToken()).toBe(true);
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("un error 500 del servidor de autenticación no cierra la sesión", async () => {
    seed(fakeJwt(600), "refresh-1");
    fetchMock.mockImplementation(async (url: string) =>
      url === REFRESH_URL ? json(500, { success: false }) : json(401, { success: false, message: "No autenticado." }),
    );

    await expect(apiRequest("/items")).rejects.toThrow();

    expect(hasAccessToken()).toBe(true);
    expect(unauthorized).not.toHaveBeenCalled();
  });

  it("una sesión sin 'recordarme' sigue en sessionStorage después de renovar", async () => {
    seed(fakeJwt(20), "refresh-1", sessionStorage);
    fetchMock.mockImplementation(async (url: string) =>
      url === REFRESH_URL ? tokenResponse(fakeJwt(900), "refresh-2") : json(200, { success: true, data: "ok" }),
    );

    await apiRequest("/items");

    expect(sessionStorage.getItem("refresh_token")).toBe("refresh-2");
    expect(localStorage.getItem("access_token")).toBeNull();
  });
});

// --- varias pestañas ---------------------------------------------------------

describe("renovación con varias pestañas", () => {
  it("si otra pestaña ya renovó mientras esperábamos el turno, no se renueva de nuevo", async () => {
    seed(fakeJwt(20), "refresh-1");
    const byOtherTab = fakeJwt(900);

    // El bloqueo simula que, antes de darnos el turno, otra pestaña renovó y guardó tokens nuevos.
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: async (_name: string, task: () => Promise<unknown>) => {
          seed(byOtherTab, "refresh-2");
          return task();
        },
      },
    });
    fetchMock.mockResolvedValue(json(200, { success: true, data: "ok" }));

    await expect(refreshSession()).resolves.toBe(true);

    expect(callsTo(fetchMock, REFRESH_URL)).toHaveLength(0);
    expect(readTokens()?.accessToken).toBe(byOtherTab);
  });

  it("si el servidor rechaza porque otra pestaña ya usó el refresh token, se toma lo que esa pestaña guardó", async () => {
    seed(fakeJwt(20), "refresh-1");
    const byOtherTab = fakeJwt(900);
    fetchMock.mockImplementation(async (url: string) => {
      if (url === REFRESH_URL) {
        seed(byOtherTab, "refresh-2"); // la otra pestaña terminó justo antes
        return json(401, { success: false, message: "El refresh token es inválido, expiró o ya fue utilizado." });
      }
      return json(200, { success: true, data: "ok" });
    });

    await expect(refreshSession()).resolves.toBe(true);

    expect(hasAccessToken()).toBe(true);
    expect(readTokens()?.accessToken).toBe(byOtherTab);
  });
});
