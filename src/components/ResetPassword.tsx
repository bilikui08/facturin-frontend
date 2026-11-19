import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { Lock, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { checkPasswordReset, resetPassword } from "../services/authService";
import { useBranding } from "../hooks/useBranding";
import LoadingBlock from "./LoadingBlock";
import StatusAlert from "./StatusAlert";
import { useQuery } from "./useQuery";

const MIN_PASSWORD = 8;

/** Pantalla pública a la que llega el enlace del email de restablecimiento: elegir y repetir la contraseña nueva. */
const ResetPassword = () => {
  const systemName = useBranding();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Se avisa antes de pedir la contraseña si el enlace ya no sirve (vencido, usado o incompleto)
  const link = useQuery(
    (signal) => (token && email ? checkPasswordReset(email, token, signal) : Promise.reject(new Error("El enlace está incompleto. Pedí uno nuevo."))),
    [token, email],
    "El enlace no es válido o venció. Pedí uno nuevo.",
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
      await resetPassword({ email, token, password, password_confirmation: confirmation });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Receipt className="size-5" aria-hidden="true" />
        </span>
        <span className="text-2xl font-semibold tracking-tight">{systemName ?? " "}</span>
      </div>

      <Card className="w-full max-w-sm shadow-sm">
        {done ? (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-lg">Contraseña actualizada</CardTitle>
              <CardDescription>Por seguridad cerramos tus sesiones abiertas. Ingresá con la contraseña nueva.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to="/">Ir a iniciar sesión</Link>
              </Button>
            </CardContent>
          </>
        ) : link.loading ? (
          <CardContent>
            <LoadingBlock />
          </CardContent>
        ) : link.error ? (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-lg">Enlace no disponible</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <StatusAlert kind="error">{link.error}</StatusAlert>
              <Button asChild className="w-full">
                <Link to="/forgot-password">Pedir un enlace nuevo</Link>
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader className="text-center">
              <CardTitle className="text-lg">Elegí tu contraseña nueva</CardTitle>
              <CardDescription>
                Para la cuenta <strong>{email}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-password">Contraseña nueva</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      id="reset-password"
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
                  <Label htmlFor="reset-confirmation">Repetí la contraseña</Label>
                  <Input
                    id="reset-confirmation"
                    type="password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                {error && <StatusAlert kind="error">{error}</StatusAlert>}

                <Button type="submit" className="w-full" disabled={saving || password === "" || confirmation === ""}>
                  {saving && <Spinner aria-label="Guardando" />}
                  {saving ? "Guardando..." : "Cambiar la contraseña"}
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
};

export default ResetPassword;
