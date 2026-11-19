/**
 * Almacén de tokens de sesión.
 *
 * Los tokens viven en localStorage ("recordarme") o en sessionStorage (solo esa pestaña).
 * Este módulo es el único que lee y escribe esas claves.
 */

const KEYS = ["access_token", "refresh_token", "token_type", "expires_in", "expires_at"] as const;

export interface StoredTokens {
  accessToken: string;
  /** null en sesiones iniciadas antes de que existiera la renovación */
  refreshToken: string | null;
  tokenType: string;
  /** Momento de vencimiento del access token (ms desde epoch), o null si no se pudo determinar */
  expiresAt: number | null;
}

export interface NewTokens {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string;
  /** Segundos de vida informados por auth-api */
  expiresIn?: number | string | null;
}

/** Con menos de este margen de vida, el access token se renueva antes de usarlo. */
export const REFRESH_MARGIN_MS = 60_000;

/** Lee el vencimiento (claim `exp`) de un JWT, en ms. null si no es un JWT legible. */
export const jwtExpiry = (jwt: string): number | null => {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp: unknown = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
};

/** Claims de un JWT (sin verificar la firma: sirve para dibujar la interfaz, nunca para autorizar). null si no es legible. */
export const jwtClaims = (jwt: string): Record<string, unknown> | null => {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const parsed: unknown = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** Se dispara cuando cambian los tokens de esta pestaña (login, renovación, cambio de empresa, cierre de sesión). */
export const TOKENS_CHANGED_EVENT = "facturin:tokens-changed";

const notifyTokensChanged = (): void => {
  window.dispatchEvent(new Event(TOKENS_CHANGED_EVENT));
};

/** Storage donde está la sesión actual (null si no hay sesión). */
export const activeStorage = (): Storage | null => {
  if (localStorage.getItem("access_token")) return localStorage;
  if (sessionStorage.getItem("access_token")) return sessionStorage;
  return null;
};

export const readTokens = (): StoredTokens | null => {
  const storage = activeStorage();
  if (!storage) return null;

  const accessToken = storage.getItem("access_token");
  if (!accessToken) return null;

  const storedExpiry = Number(storage.getItem("expires_at"));

  return {
    accessToken,
    refreshToken: storage.getItem("refresh_token") || null,
    tokenType: storage.getItem("token_type") || "Bearer",
    expiresAt: jwtExpiry(accessToken) ?? (storedExpiry > 0 ? storedExpiry : null),
  };
};

export const clearTokens = (): void => {
  [localStorage, sessionStorage].forEach((storage) => {
    KEYS.forEach((key) => storage.removeItem(key));
  });
  notifyTokensChanged();
};

/** Guarda tokens nuevos en `storage` y limpia el otro, para no dejar una sesión duplicada. */
export const writeTokens = (tokens: NewTokens, storage: Storage): void => {
  const other = storage === localStorage ? sessionStorage : localStorage;
  KEYS.forEach((key) => other.removeItem(key));

  const expiresIn = Number(tokens.expiresIn);
  const expiresAt =
    jwtExpiry(tokens.accessToken) ?? (expiresIn > 0 ? Date.now() + expiresIn * 1000 : null);

  storage.setItem("access_token", tokens.accessToken);
  storage.setItem("token_type", tokens.tokenType || "Bearer");
  storage.setItem("expires_in", tokens.expiresIn == null ? "" : String(tokens.expiresIn));

  if (expiresAt === null) storage.removeItem("expires_at");
  else storage.setItem("expires_at", String(expiresAt));

  if (tokens.refreshToken) storage.setItem("refresh_token", tokens.refreshToken);
  else storage.removeItem("refresh_token");

  notifyTokensChanged();
};

export const isExpiring = (tokens: StoredTokens, marginMs = REFRESH_MARGIN_MS): boolean =>
  tokens.expiresAt !== null && tokens.expiresAt - Date.now() < marginMs;
