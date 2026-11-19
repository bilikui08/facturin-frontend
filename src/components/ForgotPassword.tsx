import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AtSign, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { requestPasswordReset } from "../services/authService";
import { useBranding } from "../hooks/useBranding";
import Recaptcha from "./Recaptcha";
import StatusAlert from "./StatusAlert";

/** Pantalla pública: pide el email y manda el enlace para elegir una contraseña nueva. La respuesta no revela si la cuenta existe. */
const ForgotPassword = () => {
  const systemName = useBranding();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSending(true);

    try {
      await requestPasswordReset(email.trim(), captcha ?? undefined);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el pedido");
    } finally {
      setCaptchaReset((n) => n + 1);
      setSending(false);
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
        <CardHeader className="text-center">
          <CardTitle className="text-lg">Restablecer contraseña</CardTitle>
          <CardDescription>
            {sent ? "Revisá tu correo." : "Ingresá el email de tu cuenta y te mandamos un enlace para elegir una contraseña nueva."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <>
              <StatusAlert kind="success">
                Si el correo está registrado, vas a recibir un enlace para restablecer la contraseña. Vale 60 minutos y se puede usar una sola vez. Si no
                lo ves, mirá en spam.
              </StatusAlert>
              <Button asChild variant="outline" className="w-full">
                <Link to="/">Volver al inicio de sesión</Link>
              </Button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <div className="relative">
                  <AtSign className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="forgot-email"
                    type="email"
                    className="pl-9"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nombre@ejemplo.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <Recaptcha onChange={setCaptcha} resetKey={captchaReset} />

              {error && <StatusAlert kind="error">{error}</StatusAlert>}

              <Button type="submit" className="w-full" disabled={sending || email.trim() === "" || !captcha}>
                {sending && <Spinner aria-label="Enviando" />}
                {sending ? "Enviando..." : "Enviarme el enlace"}
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link to="/">Volver al inicio de sesión</Link>
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default ForgotPassword;
