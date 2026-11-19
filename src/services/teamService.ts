import { authApi } from "./organizationService";

export interface Member {
  user_id: number;
  name: string;
  email: string;
  roles: string[];
}

export interface AssignableRole {
  name: string;
  description: string | null;
  permissions: { name: string; description: string | null }[];
}

export interface AdminOrganization {
  id: number;
  name: string;
  tax_id: string | null;
  is_active: boolean;
  members_count?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Primer mensaje útil de un error de auth-api: el de validación de un campo, o el general. */
const errorMessage = (body: unknown, fallback: string): string => {
  if (!isRecord(body)) return fallback;

  const field = isRecord(body.errors)
    ? Object.values(body.errors).flatMap((v) => (Array.isArray(v) ? v : [v])).find((v): v is string => typeof v === "string" && v !== "")
    : undefined;

  return field ?? (typeof body.message === "string" && body.message ? body.message : fallback);
};

const call = async <T>(path: string, method: string, body?: unknown, signal?: AbortSignal): Promise<T> => {
  const response = await authApi(path, { method, signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const parsed: unknown = await response.json().catch(() => null);

  if (!response.ok) throw new Error(errorMessage(parsed, `La solicitud falló (${response.status})`));

  return (isRecord(parsed) && "data" in parsed ? parsed.data : parsed) as T;
};

// --- Equipo de la empresa activa (permiso org.members.manage)
export const getMembers = (signal?: AbortSignal) => call<Member[]>("/auth/organization/members", "GET", undefined, signal);
export const getAssignableRoles = (signal?: AbortSignal) => call<AssignableRole[]>("/auth/organization/roles", "GET", undefined, signal);
export const addMember = (email: string, roles: string[]) => call<Member[]>("/auth/organization/members", "POST", { email, roles });
export const setMemberRoles = (userId: number, roles: string[]) => call<Member[]>(`/auth/organization/members/${userId}`, "PUT", { roles });
export const removeMember = (userId: number) => call<Member[]>(`/auth/organization/members/${userId}`, "DELETE");

// --- Todas las empresas (administrador del sistema)
export const getOrganizations = (signal?: AbortSignal) => call<AdminOrganization[]>("/auth/admin/organizations", "GET", undefined, signal);
export const createOrganization = (data: { name: string; tax_id: string | null; admin_email: string }) =>
  call<AdminOrganization>("/auth/admin/organizations", "POST", data);
export const updateOrganization = (id: number, data: Partial<Pick<AdminOrganization, "name" | "tax_id" | "is_active">>) =>
  call<AdminOrganization>(`/auth/admin/organizations/${id}`, "PUT", data);
