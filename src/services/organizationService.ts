import { AUTH_API_URL } from "../config/api";
import { refreshSession, type OrganizationSummary } from "./authService";
import { activeStorage, readTokens, writeTokens } from "./tokenStore";

export interface MyOrganizations {
  /** Empresa con la que se emitió el token actual (null si no se sabe: sesión anterior a las empresas) */
  current: number | null;
  organizations: OrganizationSummary[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const authorization = (): string | null => {
  const tokens = readTokens();
  if (!tokens) return null;
  return `${tokens.tokenType.charAt(0).toUpperCase()}${tokens.tokenType.slice(1).toLowerCase()} ${tokens.accessToken}`;
};

/** Pedido autenticado a auth-api: ante un 401 renueva la sesión una vez y repite. */
export const authApi = async (path: string, init: RequestInit = {}): Promise<Response> => {
  const send = () =>
    fetch(`${AUTH_API_URL}${path}`, {
      ...init,
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: authorization() ?? "", ...(init.headers as object) },
    });

  const response = await send();

  return response.status === 401 && (await refreshSession()) ? send() : response;
};

/** Empresas con las que puede trabajar la persona y cuál es la actual. */
export const getMyOrganizations = async (signal?: AbortSignal): Promise<MyOrganizations> => {
  const response = await authApi("/auth/organizations", { signal });
  const body: unknown = await response.json().catch(() => null);
  const data = isRecord(body) && isRecord(body.data) ? body.data : null;

  if (!response.ok || !data || !Array.isArray(data.organizations)) {
    throw new Error((isRecord(body) && typeof body.message === "string" && body.message) || "No se pudieron cargar las empresas");
  }

  return {
    current: typeof data.current === "number" ? data.current : null,
    organizations: data.organizations.flatMap((o) =>
      isRecord(o) && typeof o.id === "number" && typeof o.name === "string" ? [{ id: o.id, name: o.name }] : [],
    ),
  };
};

/**
 * Cambia de empresa sin volver a iniciar sesión: con el refresh token de la sesión auth-api emite tokens de la otra
 * empresa. El refresh token anterior deja de servir, así que los tokens nuevos se guardan de inmediato.
 */
export const switchOrganization = async (organizationId: number): Promise<void> => {
  const tokens = readTokens();

  if (!tokens?.refreshToken) {
    throw new Error("Para cambiar de empresa volvé a iniciar sesión.");
  }

  const response = await fetch(`${AUTH_API_URL}/auth/switch-organization`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: tokens.refreshToken, organization_id: organizationId }),
  });
  const body: unknown = await response.json().catch(() => null);
  const data = isRecord(body) && isRecord(body.data) ? body.data : null;
  const issued = data && isRecord(data.tokens) ? data.tokens : null;

  if (!response.ok || !issued || typeof issued.access_token !== "string") {
    throw new Error((isRecord(body) && typeof body.message === "string" && body.message) || "No se pudo cambiar de empresa");
  }

  writeTokens(
    {
      accessToken: issued.access_token,
      refreshToken: typeof issued.refresh_token === "string" ? issued.refresh_token : null,
      tokenType: typeof issued.token_type === "string" ? issued.token_type : "Bearer",
      expiresIn: typeof issued.expires_in === "number" || typeof issued.expires_in === "string" ? issued.expires_in : null,
    },
    activeStorage() ?? localStorage,
  );
};

/** Roles globales de la persona (los lista auth-api en /auth/me). Solo se usa para saber si es administradora del sistema. */
export const getSystemRoles = async (signal?: AbortSignal): Promise<string[]> => {
  const response = await authApi("/auth/me", { signal });
  const body: unknown = await response.json().catch(() => null);
  const data = isRecord(body) && isRecord(body.data) ? body.data : null;

  if (!response.ok || !data) throw new Error("No se pudo consultar el usuario");

  return Array.isArray(data.roles) ? data.roles.filter((r): r is string => typeof r === "string") : [];
};
