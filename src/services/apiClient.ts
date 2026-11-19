import { BILLING_API_URL } from "../config/api";
import { refreshSession } from "./authService";
import { isExpiring, readTokens } from "./tokenStore";

const getAuthorizationHeader = (): string | null => {
  const tokens = readTokens();
  if (!tokens) return null;
  const type = tokens.tokenType;
  return `${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()} ${tokens.accessToken}`;
};

// Se dispara cuando billing rechaza el token (401): App cierra la sesión.
export const UNAUTHORIZED_EVENT = "facturin:unauthorized";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getErrorMessage = (body: unknown, fallback: string): string => {
  if (!isRecord(body)) return fallback;

  const validationError = isRecord(body.errors)
    ? Object.values(body.errors)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .find((value): value is string => typeof value === "string" && Boolean(value))
    : undefined;

  return validationError ||
    (typeof body.message === "string" ? body.message : fallback);
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const send = (path: string, options: RequestInit): Promise<Response> => {
  const authorization = getAuthorizationHeader();
  const headers = new Headers(options.headers);

  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (authorization && !headers.has("Authorization")) {
    headers.set("Authorization", authorization);
  }

  return fetch(`${BILLING_API_URL}${path}`, { ...options, headers });
};

/** Si el access token está por vencer, lo renueva antes de usarlo. */
const refreshIfExpiring = async (): Promise<void> => {
  const tokens = readTokens();
  if (!tokens?.refreshToken || !isExpiring(tokens)) return;

  try {
    await refreshSession();
  } catch {
    // Error de red al renovar: se intenta el pedido igual con el token actual.
  }
};

// Un 403 puede significar que los permisos cambiaron desde que se emitió el token (duran hasta 15 minutos): se renueva
// la sesión para que la interfaz se ponga al día. No más de una vez cada tanto, para no hacer una ronda de renovaciones.
const FORBIDDEN_REFRESH_COOLDOWN_MS = 30_000;
let lastForbiddenRefresh = 0;

const resyncAfterForbidden = async (): Promise<void> => {
  if (Date.now() - lastForbiddenRefresh < FORBIDDEN_REFRESH_COOLDOWN_MS) return;
  lastForbiddenRefresh = Date.now();

  try {
    await refreshSession();
  } catch {
    // Sin red o error del servidor: el 403 se informa igual y la sesión no se toca
  }
};

/** Solo para pruebas: permite repetir el escenario sin esperar el enfriamiento. */
export const resetForbiddenRefreshForTests = (): void => {
  lastForbiddenRefresh = 0;
};

export const apiRequest = async <T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  await refreshIfExpiring();

  let response = await send(path, options);

  // El token venció (o fue revocado): un único intento de renovar y repetir el pedido.
  if (response.status === 401 && (await refreshSession())) {
    response = await send(path, options);
  }

  const body: unknown = await response.json().catch(() => null);
  const failedByPayload = isRecord(body) && body.success === false;

  if (response.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (response.status === 403) {
    await resyncAfterForbidden();
  }

  if (!response.ok || failedByPayload) {
    throw new ApiError(
      getErrorMessage(body, `La solicitud falló (${response.status})`),
      response.status,
    );
  }

  return (isRecord(body) && "data" in body ? body.data : body) as T;
};

/** Un archivo descargado de la API (por ejemplo, una exportación a Excel). */
export interface Download {
  blob: Blob;
  /** Nombre que indicó el servidor (`Content-Disposition`), si lo pudo leer. */
  fileName: string | null;
  /** Cantidad de filas que informó el servidor (`X-Export-Rows`). */
  rows: number | null;
}

/** `attachment; filename="a.xlsx"; filename*=UTF-8''a.xlsx` -> `a.xlsx` */
const fileNameFrom = (disposition: string | null): string | null => {
  if (!disposition) return null;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // se prueba con el nombre simple
    }
  }

  return /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null;
};

/**
 * GET autenticado que devuelve un archivo en vez de JSON. Renueva la sesión igual que `apiRequest`; si el servidor rechaza el
 * pedido (por ejemplo, una exportación demasiado grande) responde JSON y se lanza con su mensaje.
 */
export const apiDownload = async (path: string): Promise<Download> => {
  await refreshIfExpiring();

  let response = await send(path, {});

  if (response.status === 401 && (await refreshSession())) {
    response = await send(path, {});
  }

  if (response.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (response.status === 403) {
    await resyncAfterForbidden();
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(getErrorMessage(body, `No se pudo exportar (${response.status})`), response.status);
  }

  const rows = Number(response.headers.get("X-Export-Rows"));

  return {
    blob: await response.blob(),
    fileName: fileNameFrom(response.headers.get("Content-Disposition")),
    rows: Number.isFinite(rows) && response.headers.has("X-Export-Rows") ? rows : null,
  };
};
