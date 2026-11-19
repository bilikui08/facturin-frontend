import { call } from "./authApiCall";

export interface RoleRow {
  id: number;
  name: string;
  description: string | null;
  /** Del sistema: no se renombra ni se borra */
  is_system: boolean;
  /** Personas distintas que lo tienen en alguna empresa */
  members_count: number;
  /** Empresas distintas donde se usa */
  organizations_count: number;
  permissions: string[];
}

export interface CatalogPermission {
  name: string;
  module: string;
  description: string | null;
}

export interface RoleInput {
  description: string | null;
  permissions: string[];
}

export const getRoles = (signal?: AbortSignal) => call<RoleRow[]>("/auth/roles", "GET", undefined, signal);
/** Catálogo completo de permisos (los define el código; acá solo se asignan a roles). */
export const getPermissionCatalog = (signal?: AbortSignal) => call<CatalogPermission[]>("/auth/permissions", "GET", undefined, signal);
export const createRole = (input: RoleInput & { name: string }) => call<RoleRow>("/auth/roles", "POST", input);
export const updateRole = (id: number, input: RoleInput) => call<RoleRow>(`/auth/roles/${id}`, "PUT", input);
export const deleteRole = (id: number) => call<null>(`/auth/roles/${id}`, "DELETE");
