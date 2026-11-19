import { useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
  type TwoFactorSetupData,
} from "../services/twoFactorService";
import LoadingBlock from "./LoadingBlock";
import RecoveryCodesPanel from "./RecoveryCodesPanel";
import StatusAlert from "./StatusAlert";
import TwoFactorSetupPanel from "./TwoFactorSetupPanel";
import { useQuery } from "./useQuery";

type Dialogs = { kind: "none" } | { kind: "setup"; data: TwoFactorSetupData } | { kind: "codes"; codes: string[] } | { kind: "disable" } | { kind: "regenerate" };

const message = (err: unknown): string => (err instanceof Error ? err.message : "Ocurrió un error inesperado");

/**
 * Seguridad de la cuenta: verificación en dos pasos (activa por defecto). Apagarla pide la contraseña y un código vigente;
 * volver a activarla pide configurar la aplicación de nuevo.
 */
const TwoFactorCard = () => {
  const [reload, setReload] = useState(0);
  const { data: status, loading, error: loadError } = useQuery((signal) => getTwoFactorStatus(signal), [reload], "No se pudo cargar la verificación en dos pasos");
  const [dialog, setDialog] = useState<Dialogs>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");

  const close = () => {
    setDialog({ kind: "none" });
    setError("");
    setPassword("");
    setCode("");
  };

  const run = async (action: () => Promise<void>) => {
    setError("");
    setBusy(true);

    try {
      await action();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = (wanted: boolean) => {
    setNotice("");
    setError("");

    if (!wanted) {
      setDialog({ kind: "disable" });
      return;
    }

    void run(async () => {
      setDialog({ kind: "setup", data: await startTwoFactorSetup() });
    });
  };

  const handleDisable = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void run(async () => {
      await disableTwoFactor(password, code.trim());
      close();
      setNotice("Verificación en dos pasos desactivada. Tu cuenta quedó protegida solo por la contraseña.");
      setReload((n) => n + 1);
    });
  };

  const handleRegenerate = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void run(async () => {
      const codes = await regenerateRecoveryCodes(code.trim());
      setCode("");
      setDialog({ kind: "codes", codes });
      setReload((n) => n + 1);
    });
  };

  const handleConfirm = (confirmation: string) => {
    void run(async () => {
      const result = await confirmTwoFactorSetup(confirmation);
      setDialog({ kind: "codes", codes: result.recovery_codes });
      setReload((n) => n + 1);
    });
  };

  const enabled = status?.enabled ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5" aria-hidden="true" />
          Seguridad de la cuenta
        </CardTitle>
        <CardDescription>Protegé tu cuenta: además de la contraseña, al ingresar se pide un código de tu aplicación de autenticación.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError && <StatusAlert kind="error">{loadError}</StatusAlert>}
        {notice && <StatusAlert kind="success">{notice}</StatusAlert>}
        {error && dialog.kind === "none" && <StatusAlert kind="error">{error}</StatusAlert>}

        {loading && !status ? (
          <LoadingBlock />
        ) : status ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="two-factor-switch" className="text-base">
                  Verificación en dos pasos
                </Label>
                <p className="text-sm text-muted-foreground">{enabled ? "Activa" : "Desactivada: tu cuenta depende solo de la contraseña."}</p>
              </div>
              <Switch id="two-factor-switch" checked={enabled} disabled={busy} onCheckedChange={handleToggle} aria-label="Verificación en dos pasos" />
            </div>

            {enabled && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <p className="text-sm text-muted-foreground">
                  Códigos de recuperación disponibles: <strong>{status.recovery_codes_remaining}</strong>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNotice("");
                    setDialog({ kind: "regenerate" });
                  }}
                >
                  <KeyRound aria-hidden="true" />
                  Generar códigos nuevos
                </Button>
              </div>
            )}
          </>
        ) : null}
      </CardContent>

      <Dialog open={dialog.kind !== "none"} onOpenChange={(open) => !open && !busy && close()}>
        <DialogContent>
          {dialog.kind === "setup" && (
            <>
              <DialogHeader>
                <DialogTitle>Activar la verificación en dos pasos</DialogTitle>
                <DialogDescription>Configurá tu aplicación de autenticación y confirmá con un código.</DialogDescription>
              </DialogHeader>
              <TwoFactorSetupPanel secret={dialog.data.secret} uri={dialog.data.uri} confirming={busy} error={error} onConfirm={handleConfirm} confirmLabel="Activar" />
            </>
          )}

          {dialog.kind === "codes" && (
            <>
              <DialogHeader>
                <DialogTitle>Tus códigos de recuperación</DialogTitle>
                <DialogDescription>Los anteriores, si los había, ya no sirven.</DialogDescription>
              </DialogHeader>
              <RecoveryCodesPanel codes={dialog.codes} onDone={close} doneLabel="Listo" />
            </>
          )}

          {dialog.kind === "disable" && (
            <>
              <DialogHeader>
                <DialogTitle>Desactivar la verificación en dos pasos</DialogTitle>
                <DialogDescription>Por seguridad, confirmá con tu contraseña y un código de tu aplicación (o uno de recuperación).</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleDisable} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="disable-password">Contraseña</Label>
                  <Input id="disable-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="disable-code">Código</Label>
                  <Input id="disable-code" inputMode="numeric" autoComplete="one-time-code" maxLength={12} value={code} onChange={(e) => setCode(e.target.value)} required />
                </div>
                {error && <StatusAlert kind="error">{error}</StatusAlert>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={close}>
                    Cancelar
                  </Button>
                  <Button type="submit" variant="destructive" disabled={busy || password === "" || code.trim() === ""}>
                    {busy && <Spinner aria-label="Desactivando" />}
                    Desactivar
                  </Button>
                </div>
              </form>
            </>
          )}

          {dialog.kind === "regenerate" && (
            <>
              <DialogHeader>
                <DialogTitle>Generar códigos de recuperación nuevos</DialogTitle>
                <DialogDescription>Los códigos actuales dejan de servir. Confirmá con un código de tu aplicación.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleRegenerate} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="regenerate-code">Código de 6 dígitos</Label>
                  <Input id="regenerate-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} required />
                </div>
                {error && <StatusAlert kind="error">{error}</StatusAlert>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={close}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={busy || code.trim() === ""}>
                    {busy && <Spinner aria-label="Generando" />}
                    Generar
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default TwoFactorCard;
