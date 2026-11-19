import { clearTokens, writeTokens } from "../services/tokenStore";

const b64url = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

interface SignInOptions {
  /** Id de la persona (claim sub) */
  userId?: number;
  /** Empresa (claim org). Omitirla simula un token anterior a las empresas. */
  organizationId?: number;
  /** Permisos de la empresa (claim permissions) */
  permissions?: string[];
  refreshToken?: string | null;
}

/** Inicia una sesión de prueba con un JWT (sin firma real) que lleva esos claims. */
export const signIn = ({ userId = 7, organizationId, permissions, refreshToken = "refresh-1" }: SignInOptions = {}): string => {
  const claims: Record<string, unknown> = { sub: String(userId), jti: Math.random().toString(36).slice(2), exp: Math.floor(Date.now() / 1000) + 900 };
  if (organizationId !== undefined) claims.org = organizationId;
  if (permissions !== undefined) claims.permissions = permissions;

  const jwt = `${b64url({ alg: "RS256" })}.${b64url(claims)}.firma`;
  writeTokens({ accessToken: jwt, refreshToken, tokenType: "Bearer", expiresIn: 900 }, localStorage);

  return jwt;
};

export const signOut = (): void => clearTokens();
