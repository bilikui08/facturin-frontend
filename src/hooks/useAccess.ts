import { useMemo, useSyncExternalStore } from "react";
import { canSeeSection, hasAny, readAccess, type Access } from "../services/access";
import { TOKENS_CHANGED_EVENT, readTokens } from "../services/tokenStore";
import type { SectionKey } from "../config/permissions";

const subscribe = (notify: () => void): (() => void) => {
  window.addEventListener(TOKENS_CHANGED_EVENT, notify);
  window.addEventListener("storage", notify); // otra pestaña renovó o cambió de empresa
  return () => {
    window.removeEventListener(TOKENS_CHANGED_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
};

/** El access token actual como valor estable: cuando cambia (renovación, otra empresa) la interfaz se vuelve a dibujar. */
const snapshot = (): string => readTokens()?.accessToken ?? "";

export interface UseAccess extends Access {
  /** ¿Tiene alguno de esos permisos? */
  can: (...permissions: string[]) => boolean;
  canSee: (section: SectionKey) => boolean;
}

/**
 * Quién es la persona y qué puede hacer en su empresa, leído del token (sin llamadas a la red). Se actualiza solo con cada
 * renovación del token. Sirve para mostrar u ocultar: la autorización real la hace el servidor.
 */
export const useAccess = (): UseAccess => {
  const token = useSyncExternalStore(subscribe, snapshot, () => "");

  return useMemo(() => {
    const access = readAccess();
    return {
      ...access,
      can: (...permissions: string[]) => hasAny(access, permissions),
      canSee: (section: SectionKey) => canSeeSection(access, section),
    };
    // el token es la entrada: readAccess() lo vuelve a leer del almacenamiento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
};
