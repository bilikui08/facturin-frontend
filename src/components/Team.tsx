import { useState } from "react";
import { MailPlus, Pencil, Send, UserMinus, X } from "lucide-react";
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
import { useAccess } from "../hooks/useAccess";
import { formatDateTime } from "../utils/auditFormat";
import {
  getAssignableRoles,
  getInvitations,
  getMembers,
  inviteMember,
  removeMember,
  revokeInvitation,
  setMemberRoles,
  type AssignableRole,
  type InviteResult,
  type Member,
  type PendingInvitation,
} from "../services/teamService";
import FormField from "./FormField";
import LoadingBlock from "./LoadingBlock";
import StatusAlert from "./StatusAlert";
import { useQuery } from "./useQuery";

/** "Vendedor: factura y administra clientes" → "Vendedor" */
const roleTitle = (role: AssignableRole | undefined, fallback: string): string => (role?.description ?? fallback).split(":")[0];

/** Qué permite el rol, en una línea: lo que dice su descripción después de los dos puntos, o la cantidad de permisos. */
const roleSummary = (role: AssignableRole): string => {
  const detail = role.description?.includes(":") ? role.description.split(":").slice(1).join(":").trim() : "";

  return detail ? detail.charAt(0).toUpperCase() + detail.slice(1) : `${role.permissions.length} ${role.permissions.length === 1 ? "permiso" : "permisos"}`;
};

const roleHint = (role: AssignableRole): string => role.permissions.map((p) => p.description ?? p.name).join(" · ");

interface RolePickerProps {
  roles: AssignableRole[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}

/** Casillas de roles; cada una explica qué permite (tooltip y detalle). */
const RolePicker = ({ roles, selected, onChange, disabled }: RolePickerProps) => (
  <fieldset className="space-y-3" disabled={disabled}>
    <legend className="mb-2 text-sm font-medium">Roles</legend>
    {roles.map((role) => (
      <div key={role.name} className="flex items-start gap-3" title={roleHint(role)}>
        <Checkbox
          id={`role-${role.name}`}
          checked={selected.includes(role.name)}
          onCheckedChange={(checked) =>
            onChange(checked === true ? [...selected, role.name] : selected.filter((name) => name !== role.name))
          }
        />
        <div className="space-y-0.5">
          <Label htmlFor={`role-${role.name}`} className="font-medium">
            {roleTitle(role, role.name)}
          </Label>
          <p className="text-xs text-muted-foreground">{roleSummary(role)}</p>
        </div>
      </div>
    ))}
  </fieldset>
);

type Editing = { kind: "add" } | { kind: "roles"; member: Member } | null;

/** Equipo: las personas de la empresa y sus roles (requiere el permiso de administrar personas). */
const Team = () => {
  const { userId } = useAccess();
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [pendingRemove, setPendingRemove] = useState<Member | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const members = useQuery((signal) => getMembers(signal), [reload], "No se pudo cargar el equipo");
  const invitations = useQuery((signal) => getInvitations(signal), [reload], "No se pudieron cargar las invitaciones");
  const roles = useQuery((signal) => getAssignableRoles(signal), [], "No se pudieron cargar los roles");

  const roleList = roles.data ?? [];
  const byName = new Map(roleList.map((role) => [role.name, role]));

  const openAdd = () => {
    setEmail("");
    setSelected([]);
    setFormError("");
    setEditing({ kind: "add" });
  };

  const openRoles = (member: Member) => {
    setSelected(member.roles);
    setFormError("");
    setEditing({ kind: "roles", member });
  };

  /** Avisa qué pasó al sumar a alguien por email: entró al instante, se le mandó la invitación, o el correo no salió. */
  const reportInvite = (email: string, result: InviteResult) => {
    if (result.status === "added") {
      setNotice({ kind: "success", text: `${email} ya tenía cuenta: se la sumó a la empresa${result.email_sent ? " y se le avisó por email" : ""}.` });
    } else if (result.email_sent) {
      setNotice({ kind: "success", text: `Invitación enviada a ${email}. Vence en 7 días.` });
    } else {
      setNotice({ kind: "error", text: `La invitación a ${email} quedó guardada, pero no se pudo enviar el correo. Probá reenviarla en un rato.` });
    }
  };

  const resend = async (invitation: PendingInvitation) => {
    setNotice(null);

    try {
      reportInvite(invitation.email, await inviteMember(invitation.email, invitation.roles));
      setReload((n) => n + 1);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "No se pudo reenviar la invitación" });
    }
  };

  const cancelInvitation = async (invitation: PendingInvitation) => {
    setNotice(null);

    try {
      await revokeInvitation(invitation.id);
      setNotice({ kind: "success", text: `Invitación a ${invitation.email} cancelada.` });
      setReload((n) => n + 1);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "No se pudo cancelar la invitación" });
    }
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setFormError("");

    try {
      if (editing.kind === "add") {
        const address = email.trim();
        reportInvite(address, await inviteMember(address, selected));
      } else {
        await setMemberRoles(editing.member.user_id, selected);
        setNotice({ kind: "success", text: `Roles de ${editing.member.name} actualizados.` });
      }
      setEditing(null);
      setReload((n) => n + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (member: Member) => {
    setPendingRemove(null);
    setNotice(null);

    try {
      await removeMember(member.user_id);
      setNotice({ kind: "success", text: `${member.name} ya no pertenece a la empresa.` });
      setReload((n) => n + 1);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "No se pudo quitar a la persona" });
    }
  };

  const list = members.data ?? [];

  return (
    <section className="space-y-6">
      <p className="text-muted-foreground">
        Las personas que trabajan con los datos de tu empresa y lo que puede hacer cada una. Para sumar a alguien alcanza con su email:
        si todavía no tiene cuenta, le llega una invitación para crearla.
      </p>

      {members.error && <StatusAlert kind="error">{members.error}</StatusAlert>}
      {invitations.error && <StatusAlert kind="error">{invitations.error}</StatusAlert>}
      {roles.error && <StatusAlert kind="error">{roles.error}</StatusAlert>}
      {notice && <StatusAlert kind={notice.kind}>{notice.text}</StatusAlert>}

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row items-center justify-between border-b py-4 [.border-b]:pb-4">
          <CardTitle className="text-base">Personas de la empresa</CardTitle>
          <Button type="button" size="sm" onClick={openAdd} disabled={roleList.length === 0}>
            <MailPlus />
            Agregar persona
          </Button>
        </CardHeader>

        <CardContent className="p-0">
          {members.loading && !members.data ? (
            <LoadingBlock />
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((member) => (
                  <TableRow key={member.user_id}>
                    <TableCell className="font-medium">
                      {member.name}
                      {member.user_id === userId && (
                        <Badge variant="outline" className="ml-2">
                          Vos
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{member.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {member.roles.map((name) => (
                          <Badge key={name} variant="secondary" title={byName.get(name) ? roleHint(byName.get(name)!) : undefined}>
                            {roleTitle(byName.get(name), name)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" type="button" aria-label={`Cambiar roles de ${member.name}`} onClick={() => openRoles(member)}>
                          <Pencil />
                          Roles
                        </Button>
                        <Button variant="outline" size="sm" type="button" aria-label={`Quitar a ${member.name}`} onClick={() => setPendingRemove(member)}>
                          <UserMinus />
                          Quitar
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
            {list.length} {list.length === 1 ? "persona" : "personas"}
          </CardFooter>
        )}
      </Card>

      {(invitations.data ?? []).length > 0 && (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="border-b py-4 [.border-b]:pb-4">
            <CardTitle className="text-base">Invitaciones pendientes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead>Invitó</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invitations.data ?? []).map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium">{invitation.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {invitation.roles.map((name) => (
                          <Badge key={name} variant="secondary">
                            {roleTitle(byName.get(name), name)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{invitation.invited_by ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{formatDateTime(invitation.expires_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" type="button" aria-label={`Reenviar la invitación a ${invitation.email}`} onClick={() => void resend(invitation)}>
                          <Send />
                          Reenviar
                        </Button>
                        <Button variant="outline" size="sm" type="button" aria-label={`Cancelar la invitación a ${invitation.email}`} onClick={() => void cancelInvitation(invitation)}>
                          <X />
                          Cancelar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && !saving && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.kind === "roles" ? `Roles de ${editing.member.name}` : "Agregar persona"}</DialogTitle>
            <DialogDescription>
              {editing?.kind === "roles"
                ? "Los cambios rigen desde la próxima vez que la persona renueve su sesión (hasta 15 minutos)."
                : "Indicá su email y qué va a poder hacer. Si todavía no tiene cuenta, le mandamos una invitación para crearla."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {editing?.kind === "add" && (
              <FormField label="Email" htmlFor="member-email">
                <Input
                  id="member-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@ejemplo.com"
                  autoComplete="off"
                />
              </FormField>
            )}

            <RolePicker roles={roleList} selected={selected} onChange={setSelected} disabled={saving} />

            {formError && <StatusAlert kind="error">{formError}</StatusAlert>}
          </div>

          <DialogFooter>
            <Button variant="secondary" type="button" disabled={saving} onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={saving || selected.length === 0 || (editing?.kind === "add" && email.trim() === "")}
              onClick={() => void save()}
            >
              {saving && <Spinner aria-label="Guardando" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingRemove !== null} onOpenChange={(open) => !open && setPendingRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar a {pendingRemove?.name} de la empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Va a dejar de ver los datos de la empresa y sus sesiones abiertas no se van a poder renovar. Lo que hizo queda registrado en la
              Auditoría. Podés volver a agregarla cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => pendingRemove && void remove(pendingRemove)}>
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default Team;
