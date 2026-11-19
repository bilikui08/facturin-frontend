import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { twoFactorConfirm, twoFactorSetup, twoFactorVerify, type LoginResult } from "../services/authService";
import LoadingBlock from "./LoadingBlock";
import RecoveryCodesPanel from "./RecoveryCodesPanel";
import StatusAlert from "./StatusAlert";
import TwoFactorSetupPanel from "./TwoFactorSetupPanel";

interface TwoFactorStepProps {
  challengeToken: string;
  /** `verify`: pedir el código. `setup`: primer ingreso, configurar la aplicación. */
  mode: "verify" | "setup";
  remember: boolean;
  /** Recibe cómo sigue el ingreso (entrar, o elegir empresa) */
  onResult: (result: LoginResult) => void;
  onCancel: () => void;
}

const message = (err: unknown): string => (err instanceof Error ? err.message : "Ocurrió un error inesperado");

/** Segundo factor del ingreso: se muestra después de que usuario, contraseña y captcha fueron correctos. */
const TwoFactorStep = ({ challengeToken, mode, remember, onResult, onCancel }: TwoFactorStepProps) => {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<{ list: string[]; finish: () => LoginResult } | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "setup") return;
    let cancelled = false;

    twoFactorSetup(challengeToken)
      .then((data) => {
        if (!cancelled) setSetup(data);
      })
      .catch((err) => {
        if (!cancelled) setError(message(err));
      });

    return () => {
      cancelled = true;
    };
  }, [mode, challengeToken]);

  const handleVerify = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      onResult(await twoFactorVerify(challengeToken, code.trim(), remember));
    } catch (err) {
      setError(message(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (confirmation: string) => {
    setError("");
    setBusy(true);

    try {
      const result = await twoFactorConfirm(challengeToken, confirmation, remember);
      setCodes({ list: result.recoveryCodes, finish: result.finish });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    if (!codes) return;
    try {
      onResult(codes.finish());
    } catch (err) {
      setError(message(err));
    }
  };

  return (
    <Card className="w-full max-w-sm shadow-sm">
      {codes ? (
        <>
          <CardHeader className="text-center">
            <CardTitle className="text-lg">Verificación en dos pasos activada</CardTitle>
            <CardDescription>Estos son tus códigos de recuperación.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <RecoveryCodesPanel codes={codes.list} onDone={finish} doneLabel="Continuar" />
            {error && <StatusAlert kind="error">{error}</StatusAlert>}
          </CardContent>
        </>
      ) : mode === "setup" ? (
        <>
          <CardHeader className="text-center">
            <CardTitle className="text-lg">Activá la verificación en dos pasos</CardTitle>
            <CardDescription>Protege tu cuenta: además de la contraseña, se pide un código de tu celular.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {setup ? (
              <TwoFactorSetupPanel secret={setup.secret} uri={setup.uri} confirming={busy} error={error} onConfirm={(c) => void handleConfirm(c)} confirmLabel="Activar y continuar" />
            ) : error ? (
              <StatusAlert kind="error">{error}</StatusAlert>
            ) : (
              <LoadingBlock />
            )}
            <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onCancel}>
              Volver
            </Button>
          </CardContent>
        </>
      ) : (
        <>
          <CardHeader className="text-center">
            <CardTitle className="text-lg">Verificación en dos pasos</CardTitle>
            <CardDescription>
              {useRecovery ? "Ingresá uno de tus códigos de recuperación." : "Ingresá el código de 6 dígitos de tu aplicación de autenticación."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="two-factor-code">{useRecovery ? "Código de recuperación" : "Código de verificación"}</Label>
                <div className="relative">
                  {useRecovery ? (
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  )}
                  <Input
                    id="two-factor-code"
                    className="pl-9 font-mono tracking-widest"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode={useRecovery ? "text" : "numeric"}
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={useRecovery ? 12 : 7}
                    placeholder={useRecovery ? "XXXXX-XXXXX" : "000000"}
                    required
                  />
                </div>
              </div>

              {error && <StatusAlert kind="error">{error}</StatusAlert>}

              <Button type="submit" className="w-full" disabled={busy || code.trim() === ""}>
                {busy && <Spinner aria-label="Verificando" />}
                {busy ? "Verificando..." : "Verificar"}
              </Button>

              <button
                type="button"
                className="block w-full text-center text-sm text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setUseRecovery((v) => !v);
                  setCode("");
                  setError("");
                }}
              >
                {useRecovery ? "Usar el código de mi aplicación" : "Usar un código de recuperación"}
              </button>
              <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={onCancel}>
                Volver
              </Button>
            </form>
          </CardContent>
        </>
      )}
    </Card>
  );
};

export default TwoFactorStep;
