import { HOME_ORDER, SECTION_PERMISSIONS, type SectionKey } from "../config/permissions";
import { jwtClaims, readTokens } from "./tokenStore";

/** Lo que el token de la sesión dice sobre la persona: quién es, en qué empresa y qué puede hacer. */
export interface Access {
  /** Id de la persona (claim `sub`), o null si no hay sesión */
  userId: number | null;
  /** Empresa del token (claim `org`); null en una sesión anterior a las empresas */
  organizationId: number | null;
  /** Permisos de la persona en esa empresa; null = sesión anterior a las empresas, que conserva todos */
  permissions: readonly string[] | null;
}

export const NO_ACCESS: Access = { userId: null, organizationId: null, permissions: null };

/** Lee el access token de la sesión actual. Es informativo (la firma no se verifica acá): el servidor decide siempre. */
export const readAccess = (): Access => {
  const tokens = readTokens();
  const claims = tokens ? jwtClaims(tokens.accessToken) : null;

  if (!claims) return NO_ACCESS;

  const sub = Number(claims.sub);
  const org = claims.org;

  return {
    userId: Number.isInteger(sub) && sub > 0 ? sub : null,
    organizationId: typeof org === "number" ? org : null,
    permissions:
      typeof org === "number"
        ? Array.isArray(claims.permissions)
          ? claims.permissions.filter((p): p is string => typeof p === "string")
          : []
        : null,
  };
};

/** ¿Tiene alguno de esos permisos? Sin permisos que pedir, siempre. Una sesión anterior a las empresas puede todo. */
export const hasAny = (access: Access, permissions: readonly string[]): boolean =>
  permissions.length === 0 || access.permissions === null || permissions.some((p) => access.permissions!.includes(p));

export const canSeeSection = (access: Access, section: SectionKey): boolean => hasAny(access, SECTION_PERMISSIONS[section]);

/** Primera pantalla a la que la persona tiene acceso (para "entrar" a la aplicación). */
export const firstAllowedSection = (access: Access): SectionKey =>
  HOME_ORDER.find((section) => canSeeSection(access, section)) ?? "settings";
