import { NavLink, Outlet, useLocation } from "react-router";
import { Building2, FileText, Mail, Settings2, ShieldCheck, History, LogOut, Receipt, Settings as SettingsIcon, Store, Trash2, UserCog, Users, UsersRound, Wallet } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAccess } from "../hooks/useAccess";
import { useSystemAdmin } from "../hooks/useSystemAdmin";
import type { SectionKey } from "../config/permissions";
import CompanySwitcher from "./CompanySwitcher";
import ThemeToggle from "./ThemeToggle";

interface Section {
  path: SectionKey;
  label: string;
  icon: typeof Receipt;
}

const sections: Section[] = [
  { path: "invoices", label: "Facturar", icon: Receipt },
  { path: "invoices-list", label: "Comprobantes emitidos", icon: FileText },
  { path: "receivables", label: "Cuenta corriente", icon: Wallet },
  { path: "customers", label: "Clientes", icon: Users },
  { path: "sale-points", label: "Puntos de venta", icon: Store },
  { path: "billing-profile", label: "Datos de facturación", icon: UserCog },
  { path: "audit", label: "Auditoría", icon: History },
  { path: "trash", label: "Papelera", icon: Trash2 },
];

// Administración: va aparte del menú de trabajo
const adminSections: Section[] = [
  { path: "team", label: "Equipo", icon: UsersRound },
  { path: "companies", label: "Empresas", icon: Building2 },
  { path: "system", label: "Sistema", icon: Settings2 },
  { path: "roles", label: "Roles", icon: ShieldCheck },
  { path: "emails", label: "Emails", icon: Mail },
];

// Va abajo del menú, arriba de "Cerrar sesión"
const settingsSection: Section = { path: "settings", label: "Configuración", icon: SettingsIcon };

interface DashboardProps {
  onLogout: () => void;
}

const Dashboard = ({ onLogout }: DashboardProps) => {
  const { pathname } = useLocation();
  const { canSee } = useAccess();
  const isSystemAdmin = useSystemAdmin();

  // Solo se muestra lo que la persona puede usar (el servidor igual lo hace cumplir)
  const visibleSections = sections.filter((section) => canSee(section.path));
  const visibleAdmin = adminSections.filter((section) => (["companies", "system", "emails", "roles"].includes(section.path) ? isSystemAdmin : canSee(section.path)));

  // Una sección también está activa en sus pantallas internas (p. ej. /receivables/customer/5)
  const inSection = (path: string) => pathname.endsWith(`/${path}`) || pathname.includes(`/${path}/`);

  const activeSectionLabel =
    [...sections, ...adminSections, settingsSection].find((section) => inSection(section.path))?.label ?? "Dashboard";

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <NavLink
            to="/dashboard/invoices"
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Receipt className="size-4" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold tracking-tight">Facturín</span>
          </NavLink>
          <CompanySwitcher />
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menú</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu aria-label="Navegación principal">
                {visibleSections.map(({ path, label, icon: Icon }) => (
                  <SidebarMenuItem key={path}>
                    <SidebarMenuButton
                      asChild
                      isActive={inSection(path)}
                      tooltip={label}
                    >
                      <NavLink to={path}>
                        <Icon aria-hidden="true" />
                        <span>{label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {visibleAdmin.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel>Administración</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu aria-label="Administración">
                  {visibleAdmin.map(({ path, label, icon: Icon }) => (
                    <SidebarMenuItem key={path}>
                      <SidebarMenuButton asChild isActive={inSection(path)} tooltip={label}>
                        <NavLink to={path}>
                          <Icon aria-hidden="true" />
                          <span>{label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={inSection(settingsSection.path)}
                tooltip={settingsSection.label}
              >
                <NavLink to={settingsSection.path}>
                  <settingsSection.icon aria-hidden="true" />
                  <span>{settingsSection.label}</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onLogout} tooltip="Cerrar sesión">
                <LogOut aria-hidden="true" />
                <span>Cerrar sesión</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ml-1" aria-label="Abrir o cerrar menú" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden sm:block">Facturín</BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{activeSectionLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto w-full max-w-7xl space-y-6">
            <h1 className="text-2xl font-semibold tracking-tight">{activeSectionLabel}</h1>
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Dashboard;
