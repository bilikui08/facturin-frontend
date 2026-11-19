import { authApi } from "./organizationService";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Primer mensaje útil de un error de auth-api: el de validación de un campo, o el general. */
export const authErrorMessage = (body: unknown, fallback: string): string => {
  if (!isRecord(body)) return fallback;

  const field = isRecord(body.errors)
    ? Object.values(body.errors).flatMap((v) => (Array.isArray(v) ? v : [v])).find((v): v is string => typeof v === "string" && v !== "")
    : undefined;

  return field ?? (typeof body.message === "string" && body.message ? body.message : fallback);
};

/** Llamada autenticada a auth-api: devuelve `data`, o lanza con el mensaje del servidor (renueva la sesión ante un 401). */
export const call = async <T>(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<T> => {
  const response = await authApi(path, { method, signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const parsed: unknown = await response.json().catch(() => null);

  if (!response.ok) throw new Error(authErrorMessage(parsed, `La solicitud falló (${response.status})`));

  return (isRecord(parsed) && "data" in parsed ? parsed.data : parsed) as T;
};
