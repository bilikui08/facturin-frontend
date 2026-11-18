import type { HTMLInputTypeAttribute } from "react";

export type ResourceId = string | number;
export type ResourceValue = string | number | boolean | null | undefined;

export interface Resource {
  id: ResourceId;
  [key: string]: ResourceValue;
}

export interface FieldConfig {
  name: string;
  label: string;
  type?: HTMLInputTypeAttribute | "select";
  required?: boolean;
  placeholder?: string;
  /** Ocupa todo el ancho del formulario (por defecto, media fila). */
  fullWidth?: boolean;
  optionsEndpoint?: string;
}

export type FormValues = Record<string, string>;
