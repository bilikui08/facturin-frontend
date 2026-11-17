import { AUTH_API_URL } from "../config/api";
import {
  activeStorage,
  clearTokens,
  isExpiring,
  readTokens,
  writeTokens,
  type NewTokens,
} from "./tokenStore";

export interface LoginData {
  access_token: string;
  token_type: string;
  expires_in: string | number;
}

interface AuthResponse {
  success?: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const pickString = (
  source: Record<string, unknown>,
  keys: string[],
): string | undefined => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value) return value;
    if (typeof value === "number") return String(value);
  }
  return undefined;
};

/** Auth devuelve { data: { user, tokens: { access_token, refresh_token, ... } } } */
const parseTokens = (data: Record<string, unknown>): NewTokens | null => {
  const tokens = isRecord(data.tokens) ? data.tokens : data;

  const accessToken = pickString(tokens, ["access_token", "accessToken", "token"]);
  if (!accessToken) return null;

  return {
    accessToken,
    refreshToken: pickString(tokens, ["refresh_token", "refreshToken"]) ?? null,
    tokenType: pickString(tokens, ["token_type", "tokenType"]) ?? "Bearer",
    expiresIn: pickString(tokens, ["expires_in", "expiresIn"]) ?? "",
  };
};

const authorizationValue = (type: string, token: string): string =>
  `${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()} ${token}`;

export const login = async (
  email: string,
  password: string,
  remember: boolean,
): Promise<LoginData> => {
  const response = await fetch(`${AUTH_API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const result = (await response.json()) as AuthResponse;

  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.message || "No se pudo iniciar sesión");
  }

  const tokens = parseTokens(result.data);

  if (!tokens) {
    console.error("Respuesta de login sin token:", result);
    throw new Error("El servidor de autenticación no devolvió un token válido");
  }

  writeTokens(tokens, remember ? localStorage : sessionStorage);

  return {
    access_token: tokens.accessToken,
    token_type: tokens.tokenType ?? "Bearer",
    expires_in: tokens.expiresIn ?? "",
  };
};

export const hasAccessToken = (): boolean => activeStorage() !== null;

/**
 * Cierra la sesión local de inmediato y, en segundo plano, revoca los tokens en el servidor
 * (si el pedido falla no importa: la sesión local ya quedó cerrada).
 */
export const logout = (): void => {
  const tokens = readTokens();
  clearTokens();

  if (!tokens) return;

  void fetch(`${AUTH_API_URL}/auth/logout`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: authorizationValue(tokens.tokenType, tokens.accessToken),
    },
  }).catch(() => undefined);
};

// ---------------------------------------------------------------------------
// Renovación de la sesión
// ---------------------------------------------------------------------------

const LOCK_NAME = "facturin-token-refresh";

/**
 * Entre pestañas que comparten localStorage, solo una renueva a la vez. El refresh token
 * es de un solo uso: si dos pestañas renovaran en paralelo, la segunda fallaría.
 */
const withRefreshLock = <T>(task: () => Promise<T>): Promise<T> =>
  typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request(LOCK_NAME, task)
    : task();

const performRefresh = async (startedWith: string | null): Promise<boolean> => {
  const current = readTokens();
  if (!current?.refreshToken) return false;

  // Otra pestaña ya renovó mientras esperábamos el turno: usamos lo que dejó guardado.
  if (startedWith && current.accessToken !== startedWith && !isExpiring(current)) {
    return true;
  }

  // Un error de red lanza una excepción: no es motivo para cerrar la sesión.
  const response = await fetch(`${AUTH_API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ refresh_token: current.refreshToken }),
  });

  if (response.status >= 500) {
    throw new Error(`No se pudo renovar la sesión (${response.status})`);
  }

  const body = (await response.json().catch(() => null)) as AuthResponse | null;
  const tokens = response.ok && body?.data ? parseTokens(body.data) : null;

  if (!tokens) {
    // Rechazado: el refresh token venció, fue revocado o ya lo usó otra pestaña.
    const latest = readTokens();
    if (latest && latest.accessToken !== current.accessToken && !isExpiring(latest)) {
      return true;
    }
    clearTokens();
    return false;
  }

  writeTokens(tokens, activeStorage() ?? localStorage);
  return true;
};

let inFlight: Promise<boolean> | null = null;

/**
 * Renueva el access token con el refresh token. Devuelve true si quedó una sesión válida,
 * false si la sesión terminó (y se limpiaron los tokens). Lanza si hubo un error de red o
 * del servidor: en ese caso la sesión no se toca. Varias llamadas simultáneas comparten
 * una única renovación.
 */
export const refreshSession = (): Promise<boolean> => {
  if (!inFlight) {
    const startedWith = readTokens()?.accessToken ?? null;
    inFlight = withRefreshLock(() => performRefresh(startedWith)).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
};
