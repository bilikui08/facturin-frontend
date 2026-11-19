/**
 * Permisos de la empresa (los mismos que declara billing en cada ruta) y qué permiso(s) hacen falta para ver cada sección.
 * Con varios alcanza con uno. Esto solo decide qué se DIBUJA: quien hace cumplir los permisos es el servidor (403).
 */
export const P = {
  invoiceView: "sales.invoice.view",
  invoiceIssue: "sales.invoice.issue",
  invoiceAnnul: "sales.invoice.annul",
  customerView: "sales.customer.view",
  customerManage: "sales.customer.manage",
  salePointManage: "sales.sale-point.manage",
  billingProfileManage: "sales.billing-profile.manage",
  trashRestoreAny: "sales.trash.restore-any",
  auditViewAll: "sales.audit.view-all",
  settingsManage: "sales.settings.manage",
  membersManage: "org.members.manage",
} as const;

export type SectionKey =
  | "invoices"
  | "invoices-list"
  | "customers"
  | "sale-points"
  | "billing-profile"
  | "audit"
  | "trash"
  | "settings"
  | "team"
  | "companies"
  | "system"
  | "emails"
  | "roles";

/** Permisos que habilitan cada sección (vacío = cualquier persona autenticada; "companies" depende del rol del sistema). */
export const SECTION_PERMISSIONS: Record<SectionKey, readonly string[]> = {
  invoices: [P.invoiceIssue],
  "invoices-list": [P.invoiceView, P.invoiceIssue, P.invoiceAnnul],
  customers: [P.customerView, P.customerManage],
  "sale-points": [P.salePointManage],
  "billing-profile": [P.billingProfileManage],
  audit: [],
  trash: [P.customerManage, P.salePointManage],
  settings: [],
  team: [P.membersManage],
  companies: [],
  system: [],
  emails: [],
  roles: [],
};

/** Orden en el que se busca a dónde mandar a la persona al entrar. */
export const HOME_ORDER: readonly SectionKey[] = ["invoices", "invoices-list", "customers", "sale-points", "billing-profile", "audit", "settings"];
