import { useMemo, useState } from "react";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSystemAdmin } from "../hooks/useSystemAdmin";
import { createRole, deleteRole, getPermissionCatalog, getRoles, updateRole, type CatalogPermission, type RoleRow } from "../services/rolesService";
import FormField from "./FormField";
import LoadingBlock from "./LoadingBlock";
import { NoPermission } from "./RequirePermission";
import StatusAlert from "./StatusAlert";
import { useQuery } from "./useQuery";

const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Nombre legible de cada módulo del catálogo (el resto se muestra capitalizado). */
const MODULE_LABELS: Record<string, string> = { sales: "Ventas", org: "Empresa" };
const moduleLabel = (module: string) => MODULE_LABELS[module] ?? module.charAt(0).toUpperCase() + module.slice(1);

/** "Vendedor: factura y administra clientes" → "Vendedor" */
const roleTitle = (role: RoleRow) => (role.description ?? role.name).split(":")[0];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const usage = (role: RoleRow) =>
  role.members_count === 0 ? "Sin uso" : `${plural(role.members_count, "persona", "personas")} · ${plural(role.organizations_count, "empresa", "empresas")}`;

type Editing = { kind: "create" } | { kind: "edit"; role: RoleRow } | { kind: "view"; role: RoleRow } | null;

interface PermissionPickerProps {
  catalog: CatalogPermission[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled: boolean;
}

/** Permisos del catálogo agrupados por módulo, con «todos» por grupo. */
const PermissionPicker = ({ catalog, selected, onChange, disabled }: PermissionPickerProps) => {
  const groups = useMemo(() => {
    const byModule = new Map<string, CatalogPermission[]>();
    catalog.forEach((permission) => byModule.set(permission.module, [...(byModule.get(permission.module) ?? []), permission]));
    return [...byModule.entries()];
  }, [catalog]);

  const toggle = (name: string, checked: boolean) => onChange(checked ? [...selected, name] : selected.filter((n) => n !== name));

  return (
    <div className="space-y-4">
      {groups.map(([module, permissions]) => {
        const names = permissions.map((p) => p.name);
        const all = names.every((n) => selected.includes(n));
        const some = names.some((n) => selected.includes(n));

        return (
          <fieldset key={module} className="space-y-2 rounded-md border p-3" disabled={disabled}>
            <legend className="px-1 text-sm font-medium">{moduleLabel(module)}</legend>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`module-${module}`}
                aria-label={`Todos los permisos de ${moduleLabel(module)}`}
                checked={all ? true : some ? "indeterminate" : false}
                onCheckedChange={(checked) =>
                  onChange(checked === true ? [...new Set([...selected, ...names])] : selected.filter((n) => !names.includes(n)))
                }
              />
              <Label htmlFor={`module-${module}`} className="text-xs font-normal text-muted-foreground">
                Todos
              </Label>
            </div>
            {permissions.map((permission) => (
              <div key={permission.name} className="flex items-start gap-3 pl-1">
                <Checkbox
                  id={`perm-${permission.name}`}
                  checked={selected.includes(permission.name)}
                  onCheckedChange={(checked) => toggle(permission.name, checked === true)}
                />
                <div className="space-y-0.5">
                  <Label htmlFor={`perm-${permission.name}`} className="font-normal">
                    {permission.description ?? permission.name}
                  </Label>
                  <p className="font-mono text-xs text-muted-foreground">{permission.name}</p>
                </div>
              </div>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
};

/** Roles: grupos de permisos que se asignan a las personas de cada empresa. Solo la administración del sistema. */
const Roles = () => {
  const isSystemAdmin = useSystemAdmin();
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<RoleRow | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const roles = useQuery((signal) => (isSystemAdmin ? getRoles(signal) : Promise.resolve([] as RoleRow[])), [reload, isSystemAdmin], "No se pudieron cargar los roles");
  const catalog = useQuery((signal) => (isSystemAdmin ? getPermissionCatalog(signal) : Promise.resolve([] as CatalogPermission[])), [isSystemAdmin], "No se pudo cargar el catálogo de permisos");

  // Mientras se consulta el rol no se muestra el aviso de "sin permiso": evita un parpadeo
  if (!isSystemAdmin) return roles.loading ? <LoadingBlock /> : <NoPermission />;

  const list = roles.data ?? [];
  const readOnly = editing?.kind === "view";
  const current = editing && editing.kind !== "create" ? editing.role : null;
  const nameValid = NAME_PATTERN.test(name) && name.length <= 50;

  const openCreate = () => {
    setName("");
    setDescription("");
    setSelected([]);
    setFormError("");
    setEditing({ kind: "create" });
  };

  const openRole = (role: RoleRow, kind: "edit" | "view") => {
    setName(role.name);
    setDescription(role.description ?? "");
    setSelected(role.permissions);
    setFormError("");
    setEditing({ kind, role });
  };

  const save = async () => {
    if (!editing || editing.kind === "view") return;
    setSaving(true);
    setFormError("");

    try {
      const input = { description: description.trim() || null, permissions: selected };

      if (editing.kind === "create") {
        await createRole({ name, ...input });
        setNotice({ kind: "success", text: `Rol «${name}» creado. Ya se puede asignar en las empresas.` });
      } else {
        await updateRole(editing.role.id, input);
        setNotice({ kind: "success", text: `Rol «${editing.role.name}» actualizado.` });
      }
      setEditing(null);
      setReload((n) => n + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (role: RoleRow) => {
    setPendingDelete(null);
    setNotice(null);

    try {
      await deleteRole(role.id);
      setNotice({ kind: "success", text: `Rol «${role.name}» eliminado.` });
      setReload((n) => n + 1);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "No se pudo eliminar el rol" });
    }
  };

  return (
    <section className="space-y-6">
      <p className="text-muted-foreground">
        Un rol es un grupo de permisos que se asigna a las personas de cada empresa (desde Equipo). Los roles son los mismos para todas las empresas. Los permisos
        los define el sistema: acá solo se eligen cuáles lleva cada rol.
      </p>

      {roles.error && <StatusAlert kind="error">{roles.error}</StatusAlert>}
      {catalog.error && <StatusAlert kind="error">{catalog.error}</StatusAlert>}
      {notice && <StatusAlert kind={notice.kind}>{notice.text}</StatusAlert>}

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row items-center justify-between border-b py-4 [.border-b]:pb-4">
          <CardTitle className="text-base">Roles</CardTitle>
          <Button type="button" size="sm" onClick={openCreate} disabled={(catalog.data ?? []).length === 0}>
            <Plus />
            Nuevo rol
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {roles.loading && !roles.data ? (
            <LoadingBlock />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Rol</TableHead>
                  <TableHead>Permisos</TableHead>
                  <TableHead>En uso</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{roleTitle(role)}</span>
                        {role.is_system && <Badge variant="outline">Del sistema</Badge>}
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">{role.name}</p>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {role.permissions.length === 0 ? <span className="text-muted-foreground">—</span> : plural(role.permissions.length, "permiso", "permisos")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{usage(role)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {role.is_system ? (
                          <Button variant="outline" size="sm" type="button" aria-label={`Ver ${role.name}`} onClick={() => openRole(role, "view")}>
                            <Eye />
                            Ver
                          </Button>
                        ) : (
                          <>
                            <Button variant="outline" size="sm" type="button" aria-label={`Editar ${role.name}`} onClick={() => openRole(role, "edit")}>
                              <Pencil />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              className="text-destructive hover:text-destructive"
                              aria-label={`Eliminar ${role.name}`}
                              disabled={role.members_count > 0}
                              title={role.members_count > 0 ? `En uso: ${usage(role)}. Cambiales el rol antes de borrarlo.` : undefined}
                              onClick={() => setPendingDelete(role)}
                            >
                              <Trash2 />
                              Eliminar
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {list.length > 0 && (
          <CardFooter className="border-t py-3 text-sm text-muted-foreground">{plural(list.length, "rol", "roles")}</CardFooter>
        )}
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.kind === "create" ? "Nuevo rol" : readOnly ? `Rol «${current?.name}»` : `Editar «${current?.name}»`}</DialogTitle>
            <DialogDescription>
              {readOnly
                ? current?.name === "company_admin"
                  ? "El rol del dueño de la empresa: siempre tiene todos los permisos y no se puede modificar."
                  : "Rol del sistema: no se puede renombrar, borrar ni cambiarle los permisos."
                : "Elegí qué permisos lleva. Un rol sin permisos no se puede asignar en una empresa."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {current !== null && current.members_count > 0 && !readOnly && (
              <StatusAlert kind="error">
                Este rol lo usan {usage(current)}. Los cambios de permisos rigen para esas personas cuando renueven su sesión (hasta 15 minutos).
              </StatusAlert>
            )}

            {editing?.kind === "create" ? (
              <FormField
                label="Nombre interno"
                htmlFor="role-name"
                hint="Identificador: minúsculas, números, guiones y guion bajo, sin espacios (ej. cajero). No se puede cambiar después."
              >
                <Input id="role-name" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} aria-invalid={name !== "" && !nameValid} autoComplete="off" />
              </FormField>
            ) : (
              <p className="text-sm">
                <span className="text-muted-foreground">Nombre interno: </span>
                <span className="font-mono">{current?.name}</span>
              </p>
            )}

            <FormField
              label="Descripción"
              htmlFor="role-description"
              hint="Es lo que ven las personas al elegir el rol. Lo que va antes de los dos puntos es el nombre corto: «Cajero: cobra y emite facturas»."
            >
              <Input id="role-description" value={description} maxLength={255} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} />
            </FormField>

            <div className="space-y-2">
              <p className="text-sm font-medium">Permisos ({selected.length})</p>
              <PermissionPicker catalog={catalog.data ?? []} selected={selected} onChange={setSelected} disabled={readOnly || saving} />
            </div>

            {formError && <StatusAlert kind="error">{formError}</StatusAlert>}
          </div>

          <DialogFooter>
            <Button variant="secondary" type="button" disabled={saving} onClick={() => setEditing(null)}>
              {readOnly ? "Cerrar" : "Cancelar"}
            </Button>
            {!readOnly && (
              <Button
                type="button"
                disabled={saving || selected.length === 0 || (editing?.kind === "create" && !nameValid)}
                onClick={() => void save()}
              >
                {saving && <Spinner aria-label="Guardando" />}
                Guardar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el rol «{pendingDelete?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Nadie lo usa, así que no afecta a ninguna persona. Esta acción no se puede deshacer; si lo necesitás más adelante, hay que crearlo de nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => pendingDelete && void remove(pendingDelete)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default Roles;
