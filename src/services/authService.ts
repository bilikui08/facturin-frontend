import { AUTH_API_URL } from "../config/api";

export interface LoginData {
  access_token: string;
  token_type: string;
  expires_in: string | number;
}

interface LoginResponse {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

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

  const result = (await response.json()) as LoginResponse;

  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.message || "No se pudo iniciar sesión");
  }

  // Auth devuelve { data: { user, tokens: { access_token, ... } } }
  const tokens =
    typeof result.data.tokens === "object" && result.data.tokens !== null
      ? (result.data.tokens as Record<string, unknown>)
      : result.data;

  const accessToken = pickString(tokens, [
    "access_token",
    "accessToken",
    "token",
  ]);

  if (!accessToken) {
    console.error("Respuesta de login sin token:", result);
    throw new Error("El servidor de autenticación no devolvió un token válido");
  }

  const loginData: LoginData = {
    access_token: accessToken,
    token_type: pickString(tokens, ["token_type", "tokenType"]) ?? "Bearer",
    expires_in: pickString(tokens, ["expires_in", "expiresIn"]) ?? "",
  };

  const storage = remember ? localStorage : sessionStorage;
  const otherStorage = remember ? sessionStorage : localStorage;

  otherStorage.removeItem("access_token");
  otherStorage.removeItem("token_type");
  otherStorage.removeItem("expires_in");
  storage.setItem("access_token", loginData.access_token);
  storage.setItem("token_type", loginData.token_type);
  storage.setItem("expires_in", String(loginData.expires_in));

  return loginData;
};

export const hasAccessToken = (): boolean =>
  Boolean(
    localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token"),
  );

export const logout = (): void => {
  [localStorage, sessionStorage].forEach((storage) => {
    storage.removeItem("access_token");
    storage.removeItem("token_type");
    storage.removeItem("expires_in");
  });
};
