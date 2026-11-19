/** Un parámetro de configuración, tal como lo describe la API (la pantalla se arma sola a partir de esto). */
export interface SettingDefinition {
  key: string;
  /** Sección de la pantalla ("Papelera de reciclaje") */
  group: string;
  label: string;
  description: string;
  /** "días", "comprobantes" */
  unit: string;
  default: number;
  min: number;
  max: number;
  value: number;
  is_default: boolean;
}

/** Valor vigente de un parámetro por clave, con un respaldo si la API no responde. */
export const settingValue = (settings: SettingDefinition[] | null | undefined, key: string, fallback: number): number =>
  settings?.find((setting) => setting.key === key)?.value ?? fallback;
