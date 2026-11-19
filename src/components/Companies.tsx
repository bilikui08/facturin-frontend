import { useState } from "react";
import { Building2, Pencil, Plus, Power } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSystemAdmin } from "../hooks/useSystemAdmin";
import { createOrganization, getOrganizations, updateOrganization, type AdminOrganization } from "../services/teamService";
import FormField from "./FormField";
import LoadingBlock from "./LoadingBlock";
import { NoPermission } from "./RequirePermission";
import StatusAlert from "./StatusAlert";
import { useQuery } from "./useQuery";

type Editing = { kind: "create" } | { kind: "edit"; organization: AdminOrganization } | null;

/** Empresas: alta, edición y baja de TODAS las empresas. Solo para la administración del sistema. */
const Companies = () => {
  const isSystemAdmin = useSystemAdmin();
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [pendingToggle, setPendingToggle] = useState<AdminOrganization | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const query = useQuery((signal) => (isSystemAdmin ? getOrganizations(signal) : Promise.resolve([])), [reload, isSystemAdmin], "No se pudieron cargar las empresas");

  // Mientras se consulta el rol no se muestra el aviso de "sin permiso": evita un parpadeo
  if (!isSystemAdmin) return query.loading ? <LoadingBlock /> : <NoPermission />;

  const list = query.data ?? [];

  const openCreate = () => {
    setName("");
    setTaxId("");
    setAdminEmail("");
    setFormError("");
    setEditing({ kind: "create" });
  };

  const openEdit = (organization: AdminOrganization) => {
    setName(organization.name);
    setTaxId(organization.tax_id ?? "");
    setFormError("");
    setEditing({ kind: "edit", organization });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setFormError("");

    try {
      if (editing.kind === "create") {
        await createOrganization({ name: name.trim(), tax_id: taxId.trim() || null, admin_email: adminEmail.trim() });
        setNotice({ kind: "success", text: "Empresa creada." });
      } else {
        await updateOrganization(editing.organization.id, { name: name.trim(), tax_id: taxId.trim() || null });
        setNotice({ kind: "success", text: "Empresa actualizada." });
      }
      setEditing(null);
      setReload((n) => n + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (organization: AdminOrganization) => {
    setPendingToggle(null);
    setNotice(null);

    try {
      await updateOrganization(organization.id, { is_active: !organization.is_active });
      setNotice({ kind: "success", text: organization.is_active ? "Empresa dada de baja." : "Empresa reactivada." });
      setReload((n) => n + 1);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "No se pudo cambiar el estado" });
    }
  };

  return (
    <section className="space-y-6">
      <p className="text-muted-foreground">
        Todas las empresas del sistema. Una empresa dada de baja no deja entrar ni renovar la sesión a sus personas.
      </p>

      {query.error && <StatusAlert kind="error">{query.error}</StatusAlert>}
      {notice && <StatusAlert kind={notice.kind}>{notice.text}</StatusAlert>}

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row items-center justify-between border-b py-4 [.border-b]:pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4" aria-hidden="true" />
            Empresas
          </CardTitle>
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus />
            Nueva empresa
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {query.loading && !query.data ? (
            <LoadingBlock />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>CUIT</TableHead>
                  <TableHead>Personas</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((organization) => (
                  <TableRow key={organization.id}>
                    <TableCell className="font-medium">{organization.name}</TableCell>
                    <TableCell className="text-muted-foreground">{organization.tax_id ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{organization.members_count ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={organization.is_active ? "secondary" : "outline"}>{organization.is_active ? "Activa" : "De baja"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" type="button" aria-label={`Editar ${organization.name}`} onClick={() => openEdit(organization)}>
                          <Pencil />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          aria-label={`${organization.is_active ? "Dar de baja" : "Reactivar"} ${organization.name}`}
                          onClick={() => (organization.is_active ? setPendingToggle(organization) : void toggle(organization))}
                        >
                          <Power />
                          {organization.is_active ? "Dar de baja" : "Reactivar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {list.length > 0 && (
          <CardFooter className="border-t py-3 text-sm text-muted-foreground">
            {list.length} {list.length === 1 ? "empresa" : "empresas"}
          </CardFooter>
        )}
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.kind === "edit" ? "Editar empresa" : "Nueva empresa"}</DialogTitle>
            <DialogDescription>
              {editing?.kind === "edit"
                ? "Nombre y CUIT de la empresa."
                : "La persona indicada queda como administradora de la empresa (debe tener cuenta)."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FormField label="Nombre" htmlFor="company-name">
              <Input id="company-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
            </FormField>
            <FormField label="CUIT (opcional)" htmlFor="company-tax-id">
              <Input id="company-tax-id" value={taxId} onChange={(e) => setTaxId(e.target.value)} maxLength={20} inputMode="numeric" />
            </FormField>
            {editing?.kind === "create" && (
              <FormField label="Email de quien administra" htmlFor="company-admin-email">
                <Input id="company-admin-email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} autoComplete="off" />
              </FormField>
            )}

            {formError && <StatusAlert kind="error">{formError}</StatusAlert>}
          </div>

          <DialogFooter>
            <Button variant="secondary" type="button" disabled={saving} onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={saving || name.trim() === "" || (editing?.kind === "create" && adminEmail.trim() === "")}
              onClick={() => void save()}
            >
              {saving && <Spinner aria-label="Guardando" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingToggle !== null} onOpenChange={(open) => !open && setPendingToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Dar de baja {pendingToggle?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sus personas no van a poder entrar ni renovar la sesión. Los datos y comprobantes se conservan y se puede reactivar cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => pendingToggle && void toggle(pendingToggle)}>
              Dar de baja
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default Companies;
