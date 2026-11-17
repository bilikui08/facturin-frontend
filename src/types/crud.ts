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
  columnClass?: string;
  optionsEndpoint?: string;
}

export type FormValues = Record<string, string>;
