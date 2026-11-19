import { AUTH_API_URL } from "../config/api";
import { authApi } from "./organizationService";

export interface SystemSettings {
  system_name: string;
  default_system_name: string;
  is_default: boolean;
  max_length: number;
}

export interface EmailTemplate {
  key: string;
  label: string;
  description: string;
  variables: { name: string; description: string }[];
  is_customized: boolean;
  current: EmailTemplateDraft;
  defaults: EmailTemplateDraft;
}

export interface EmailTemplateDraft {
  subject: string;
  heading: string;
  body: string;
  button_label: string;
}

export interface EmailPreview {
  subject: string;
  html: string;
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

// --- Ajustes de la plataforma (administración del sistema)
export const getSystemSettings = (signal?: AbortSignal) => call<SystemSettings>("/auth/admin/system", "GET", undefined, signal);
/** null o vacío = volver al nombre por defecto (el del servidor). */
export const updateSystemName = (name: string | null) => call<SystemSettings>("/auth/admin/system", "PUT", { system_name: name });

// --- Plantillas de correo
export const getEmailTemplates = (signal?: AbortSignal) => call<EmailTemplate[]>("/auth/admin/email-templates", "GET", undefined, signal);
export const saveEmailTemplate = (key: string, draft: EmailTemplateDraft) => call<EmailTemplate>(`/auth/admin/email-templates/${key}`, "PUT", draft);
export const restoreEmailTemplate = (key: string) => call<EmailTemplate>(`/auth/admin/email-templates/${key}`, "DELETE");
export const previewEmailTemplate = (key: string, draft: EmailTemplateDraft, signal?: AbortSignal) =>
  call<EmailPreview>(`/auth/admin/email-templates/${key}/preview`, "POST", draft, signal);
export const sendTestEmail = (key: string, draft: EmailTemplateDraft) =>
  call<{ sent: boolean; to: string }>(`/auth/admin/email-templates/${key}/test`, "POST", draft);

// --- Marca (pública): el nombre del sistema que muestra el login antes de autenticar
export const getBranding = async (signal?: AbortSignal): Promise<string | null> => {
  try {
    const response = await fetch(`${AUTH_API_URL}/auth/branding`, { headers: { Accept: "application/json" }, signal });
    const body: unknown = await response.json().catch(() => null);
    const data = isRecord(body) && isRecord(body.data) ? body.data : null;

    return response.ok && data && typeof data.system_name === "string" && data.system_name ? data.system_name : null;
  } catch {
    return null;
  }
};
