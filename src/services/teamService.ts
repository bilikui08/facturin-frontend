import { call } from "./authApiCall";

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

export interface PendingInvitation {
  id: number;
  email: string;
  roles: string[];
  invited_by: string | null;
  expires_at: string;
  created_at: string;
}

/** Resultado de sumar a una persona por email: ya tenía cuenta (entra al instante) o se la invitó por correo. */
export interface InviteResult {
  status: "added" | "invited";
  /** false si el correo no pudo salir: la invitación queda y se puede reenviar */
  email_sent: boolean;
  members: Member[];
  invitations: PendingInvitation[];
}

export interface AdminOrganization {
  id: number;
  name: string;
  tax_id: string | null;
  is_active: boolean;
  members_count?: number;
  /** Solo al crear: la persona indicada ya tenía cuenta (assigned) o se la invitó por email (invited) */
  admin_status?: "assigned" | "invited";
  email_sent?: boolean;
}

// --- Equipo de la empresa activa (permiso org.members.manage)
export const getMembers = (signal?: AbortSignal) => call<Member[]>("/auth/organization/members", "GET", undefined, signal);
export const getAssignableRoles = (signal?: AbortSignal) => call<AssignableRole[]>("/auth/organization/roles", "GET", undefined, signal);
export const addMember = (email: string, roles: string[]) => call<Member[]>("/auth/organization/members", "POST", { email, roles });
export const inviteMember = (email: string, roles: string[]) => call<InviteResult>("/auth/organization/invitations", "POST", { email, roles });
export const getInvitations = (signal?: AbortSignal) => call<PendingInvitation[]>("/auth/organization/invitations", "GET", undefined, signal);
export const revokeInvitation = (id: number) => call<PendingInvitation[]>(`/auth/organization/invitations/${id}`, "DELETE");
export const setMemberRoles = (userId: number, roles: string[]) => call<Member[]>(`/auth/organization/members/${userId}`, "PUT", { roles });
export const removeMember = (userId: number) => call<Member[]>(`/auth/organization/members/${userId}`, "DELETE");

// --- Todas las empresas (administrador del sistema)
export const getOrganizations = (signal?: AbortSignal) => call<AdminOrganization[]>("/auth/admin/organizations", "GET", undefined, signal);
export const createOrganization = (data: { name: string; tax_id: string | null; admin_email: string }) =>
  call<AdminOrganization>("/auth/admin/organizations", "POST", data);
export const updateOrganization = (id: number, data: Partial<Pick<AdminOrganization, "name" | "tax_id" | "is_active">>) =>
  call<AdminOrganization>(`/auth/admin/organizations/${id}`, "PUT", data);
