import type { SettingDefinition } from "../types/settings";
import { apiRequest } from "./apiClient";

export const getSettings = (signal?: AbortSignal): Promise<SettingDefinition[]> =>
  apiRequest<SettingDefinition[]>("/settings", { signal });

/** Guarda los valores indicados (clave → número). Devuelve toda la configuración ya actualizada. */
export const updateSettings = (values: Record<string, number>): Promise<SettingDefinition[]> =>
  apiRequest<SettingDefinition[]>("/settings", {
    method: "PUT",
    body: JSON.stringify(values),
  });
