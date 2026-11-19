import { useState, type FormEvent } from "react";
import { AtSign, Building2, Lock, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { login, selectOrganization, type OrganizationSummary } from "../services/authService";
import { useBranding } from "../hooks/useBranding";
import StatusAlert from "./StatusAlert";

interface LoginProps {
  onLoginSuccess: () => void;
}

const Login = ({ onLoginSuccess }: LoginProps) => {
  const systemName = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Con varias empresas el login tiene un segundo paso: elegir con cuál trabajar
  const [pending, setPending] = useState<{ selectionToken: string; organizations: OrganizationSummary[] } | null>(null);
  const [choosing, setChoosing] = useState<number | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await login(email, password, remember);

      if (result?.kind === "select-organization") {
        setPending({ selectionToken: result.selectionToken, organizations: result.organizations });
        setPassword("");
      } else {
        onLoginSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChoose = async (organizationId: number) => {
    if (!pending) return;
    setError("");
    setChoosing(organizationId);

    try {
      await selectOrganization(pending.selectionToken, organizationId, remember);
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      setChoosing(null);
    }
  };

  const backToCredentials = () => {
    setPending(null);
    setError("");
  };

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Receipt className="size-5" aria-hidden="true" />
        </span>
        <span className="text-2xl font-semibold tracking-tight">{systemName ?? "\u00a0"}</span>
      </div>

      {pending ? (
        <Card className="w-full max-w-sm shadow-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-lg">Elegí la empresa</CardTitle>
            <CardDescription>Tu usuario pertenece a más de una. ¿Con cuál querés trabajar?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2" aria-label="Empresas">
              {pending.organizations.map((organization) => (
                <li key={organization.id}>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto w-full justify-start gap-3 py-3"
                    disabled={choosing !== null}
                    onClick={() => void handleChoose(organization.id)}
                  >
                    {choosing === organization.id ? <Spinner aria-label="Ingresando" /> : <Building2 aria-hidden="true" />}
                    <span className="truncate text-left">{organization.name}</span>
                  </Button>
                </li>
              ))}
            </ul>

            {error && <StatusAlert kind="error">{error}</StatusAlert>}

            <Button type="button" variant="ghost" className="w-full" disabled={choosing !== null} onClick={backToCredentials}>
              Volver
            </Button>
          </CardContent>
        </Card>
      ) : (
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-lg">Ingresá a tu cuenta</CardTitle>
          <CardDescription>Administrá tu facturación electrónica</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <AtSign
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="email"
                  id="email"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@ejemplo.com"
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="password"
                  id="password"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresá tu contraseña"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Checkbox id="remember" checked={remember} onCheckedChange={(checked) => setRemember(checked === true)} />
                <Label htmlFor="remember" className="font-normal">
                  Recordarme
                </Label>
              </div>
              <a href="/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            {error && <StatusAlert kind="error">{error}</StatusAlert>}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Spinner aria-label="Ingresando" />}
              {isLoading ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </CardContent>
      </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">{systemName ? `Panel de ${systemName}` : "\u00a0"}</p>
    </main>
  );
};

export default Login;
