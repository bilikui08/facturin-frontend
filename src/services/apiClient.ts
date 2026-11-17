import { BILLING_API_URL } from "../config/api";

const getStored = (key: string) =>
  localStorage.getItem(key) ?? sessionStorage.getItem(key);

const getAuthorizationHeader = (): string | null => {
  const token = getStored("access_token");
  if (!token) return null;
  const type = getStored("token_type") || "Bearer";
  return `${type.charAt(0).toUpperCase()}${type.slice(1).toLowerCase()} ${token}`;
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

export const apiRequest = async <T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const authorization = getAuthorizationHeader();
  const headers = new Headers(options.headers);

  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (authorization && !headers.has("Authorization")) {
    headers.set("Authorization", authorization);
  }

  const response = await fetch(`${BILLING_API_URL}${path}`, {
    ...options,
    headers,
  });

  const body: unknown = await response.json().catch(() => null);
  const failedByPayload = isRecord(body) && body.success === false;

  if (response.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (!response.ok || failedByPayload) {
    throw new ApiError(
      getErrorMessage(body, `La solicitud falló (${response.status})`),
      response.status,
    );
  }

  return (isRecord(body) && "data" in body ? body.data : body) as T;
};
