import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { Lock, Receipt, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { acceptInvitation, getInvitation } from "../services/authService";
import LoadingBlock from "./LoadingBlock";
import { useBranding } from "../hooks/useBranding";
import StatusAlert from "./StatusAlert";
import { useQuery } from "./useQuery";

interface AcceptInvitationProps {
  /** Se llama cuando la cuenta se creó y la sesión quedó iniciada */
  onAccepted: () => void;
}

const MIN_PASSWORD = 8;

/** Pantalla pública a la que llega el enlace del email de invitación: elegir nombre y contraseña para crear la cuenta. */
const AcceptInvitation = ({ onAccepted }: AcceptInvitationProps) => {
  const systemName = useBranding();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState(false);

  const invitation = useQuery(
    (signal) => (token ? getInvitation(token, signal) : Promise.reject(new Error("El enlace de la invitación está incompleto."))),
    [token],
    "No se pudo cargar la invitación",
  );

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setSaving(true);

    try {
      const result = await acceptInvitation(token, { name: name.trim(), password, password_confirmation: confirmation }, false);

      if (result === "existing_user") setExisting(true);
      else onAccepted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aceptar la invitación");
    } finally {
      setSaving(false);
    }
  };

  const info = invitation.data;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Receipt className="size-5" aria-hidden="true" />
        </span>
        <span className="text-2xl font-semibold tracking-tight">{systemName ?? "\u00a0"}</span>
      </div>

      <Card className="w-full max-w-sm shadow-sm">
        {invitation.loading && !info ? (
          <CardContent>
            <LoadingBlock />
          </CardContent>
        ) : invitation.error || !info ? (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-lg">Invitación no disponible</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <StatusAlert kind="error">{invitation.error || "La invitación no es válida o venció. Pedí que te inviten de nuevo."}</StatusAlert>
              <Button asChild variant="outline" className="w-full">
                <Link to="/">Ir al inicio</Link>
              </Button>
            </CardContent>
          </>
        ) : existing ? (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-lg">Ya tenías una cuenta</CardTitle>
              <CardDescription>Ahora también pertenecés a {info.organization}.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to="/">Ingresar con mi contraseña</Link>
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-lg">Te invitaron a {info.organization}</CardTitle>
              <CardDescription>
                {info.invited_by ? `${info.invited_by} te invitó` : "Te invitaron"} con el email <strong>{info.email}</strong>. Elegí tu nombre y una contraseña
                para crear tu cuenta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex flex-wrap items-center gap-1.5" aria-label="Roles">
                  {info.roles.map((role) => (
                    <Badge key={role.name} variant="secondary">
                      {(role.description ?? role.name).split(":")[0]}
                    </Badge>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invitation-name">Tu nombre</Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input id="invitation-name" className="pl-9" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} autoComplete="name" required />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invitation-password">Contraseña</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="invitation-password"
                      type="password"
                      className="pl-9"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Al menos {MIN_PASSWORD} caracteres.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invitation-confirmation">Repetí la contraseña</Label>
                  <Input
                    id="invitation-confirmation"
                    type="password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                {error && <StatusAlert kind="error">{error}</StatusAlert>}

                <Button type="submit" className="w-full" disabled={saving || name.trim() === ""}>
                  {saving && <Spinner aria-label="Creando la cuenta" />}
                  {saving ? "Creando la cuenta..." : "Crear mi cuenta"}
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
};

export default AcceptInvitation;
