import { AUTH_API_URL } from "../config/api";
import {
  activeStorage,
  clearTokens,
  isExpiring,
  readTokens,
  writeTokens,
  type NewTokens,
} from "./tokenStore";

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

export interface OrganizationSummary {
  id: number;
  name: string;
}

/**
 * Resultado del primer paso del login: o ya entró (una sola empresa) o hay que elegir una de varias.
 * Con varias empresas auth-api NO entrega tokens: da un permiso temporal (5 min, un solo uso) para elegir.
 */
export type LoginResult =
  | { kind: "signed-in" }
  | { kind: "select-organization"; selectionToken: string; organizations: OrganizationSummary[] };

const parseOrganizations = (value: unknown): OrganizationSummary[] =>
  Array.isArray(value)
    ? value.flatMap((item) =>
        isRecord(item) && typeof item.id === "number" && typeof item.name === "string"
          ? [{ id: item.id, name: item.name }]
          : [],
      )
    : [];

const postAuth = async (path: string, body: unknown): Promise<AuthResponse & { data: Record<string, unknown> }> => {
  const response = await fetch(`${AUTH_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  const result = (await response.json().catch(() => ({}))) as AuthResponse;

  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.message || "No se pudo iniciar sesión");
  }

  return { ...result, data: result.data };
};

const saveSession = (data: Record<string, unknown>, remember: boolean): void => {
  const tokens = parseTokens(data);

  if (!tokens) {
    console.error("Respuesta de login sin token:", data);
    throw new Error("El servidor de autenticación no devolvió un token válido");
  }

  writeTokens(tokens, remember ? localStorage : sessionStorage);
};

export const login = async (
  email: string,
  password: string,
  remember: boolean,
): Promise<LoginResult> => {
  const { data } = await postAuth("/auth/login", { email, password });

  if (data.requires_organization === true) {
    const organizations = parseOrganizations(data.organizations);
    const selectionToken = pickString(data, ["selection_token"]);

    if (!selectionToken || organizations.length === 0) {
      throw new Error("El servidor de autenticación no devolvió las empresas para elegir");
    }

    return { kind: "select-organization", selectionToken, organizations };
  }

  saveSession(data, remember);

  return { kind: "signed-in" };
};

/** Segundo paso del login (solo con varias empresas): con el permiso temporal elige una y entra. */
export const selectOrganization = async (
  selectionToken: string,
  organizationId: number,
  remember: boolean,
): Promise<void> => {
  const { data } = await postAuth("/auth/select-organization", {
    selection_token: selectionToken,
    organization_id: organizationId,
  });

  saveSession(data, remember);
};

export interface InvitationInfo {
  email: string;
  organization: string;
  invited_by: string | null;
  roles: { name: string; description: string | null }[];
  expires_at: string;
}

/** Datos de la invitación para la pantalla de aceptación. Falla con un mensaje claro si no es válida o venció. */
export const getInvitation = async (token: string, signal?: AbortSignal): Promise<InvitationInfo> => {
  const response = await fetch(`${AUTH_API_URL}/auth/invitations/${encodeURIComponent(token)}`, { headers: { Accept: "application/json" }, signal });
  const result = (await response.json().catch(() => ({}))) as AuthResponse;

  if (!response.ok || !result.data) {
    throw new Error(result.message || "No se pudo cargar la invitación");
  }

  return result.data as unknown as InvitationInfo;
};

/**
 * Acepta la invitación: crea la cuenta y entra (se guarda la sesión), o, si el email ya tenía cuenta, solo informa que quedó
 * sumada a la empresa (entrar requiere su contraseña de siempre).
 */
export const acceptInvitation = async (
  token: string,
  data: { name: string; password: string; password_confirmation: string },
  remember: boolean,
): Promise<"created" | "existing_user"> => {
  const response = await fetch(`${AUTH_API_URL}/auth/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
  });
  const result = (await response.json().catch(() => ({}))) as AuthResponse & { errors?: Record<string, string[]> };

  if (!response.ok || !result.success || !result.data) {
    const field = result.errors ? Object.values(result.errors).flat().find((v) => typeof v === "string") : undefined;
    throw new Error(field || result.message || "No se pudo aceptar la invitación");
  }

  if (result.data.status === "existing_user") return "existing_user";

  saveSession(result.data, remember);

  return "created";
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
