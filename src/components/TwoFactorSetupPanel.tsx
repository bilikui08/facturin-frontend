import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import StatusAlert from "./StatusAlert";

interface TwoFactorSetupPanelProps {
  secret: string;
  /** Dirección otpauth:// que se convierte en el QR (se dibuja en este navegador: el secreto no pasa por ningún servicio externo) */
  uri: string;
  confirming: boolean;
  error: string;
  /** Recibe el código de 6 dígitos de la aplicación */
  onConfirm: (code: string) => void;
  confirmLabel: string;
}

/** "ABCDEFGH…" → "ABCD EFGH …" (más fácil de escribir a mano) */
const grouped = (secret: string): string => secret.replace(/(.{4})/g, "$1 ").trim();

/** Configurar la aplicación de autenticación: escanear el QR (o escribir la clave) y probar el primer código. */
const TwoFactorSetupPanel = ({ secret, uri, confirming, error, onConfirm, confirmLabel }: TwoFactorSetupPanelProps) => {
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(uri, { width: 192, margin: 1 })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch(() => {
        if (!cancelled) setQr("");
      });

    return () => {
      cancelled = true;
    };
  }, [uri]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // sin permiso de portapapeles: la clave está a la vista para copiarla a mano
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onConfirm(code.replace(/\s+/g, ""));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Instalá una aplicación de autenticación (Google Authenticator, Microsoft Authenticator, Authy…).</li>
        <li>Escaneá este código QR, o escribí la clave a mano.</li>
        <li>Ingresá el código de 6 dígitos que muestra la aplicación.</li>
      </ol>

      <div className="flex justify-center">
        {qr ? (
          <img src={qr} alt="Código QR para configurar la aplicación de autenticación" width={192} height={192} className="rounded-md border bg-white p-1" />
        ) : (
          <div className="flex size-48 items-center justify-center rounded-md border" aria-label="Generando el código QR">
            <Spinner aria-label="Generando el código QR" />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="two-factor-secret">¿No podés escanear? Escribí esta clave</Label>
        <div className="flex gap-2">
          <Input id="two-factor-secret" readOnly value={grouped(secret)} className="font-mono text-sm tracking-wider" onFocus={(e) => e.currentTarget.select()} />
          <Button type="button" variant="outline" size="icon" onClick={() => void copy()} aria-label="Copiar la clave">
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="two-factor-setup-code">Código de 6 dígitos</Label>
        <Input
          id="two-factor-setup-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ""))}
          placeholder="000000"
          className="text-center font-mono text-lg tracking-[0.4em]"
          required
        />
      </div>

      {error && <StatusAlert kind="error">{error}</StatusAlert>}

      <Button type="submit" className="w-full" disabled={confirming || code.replace(/\s+/g, "").length !== 6}>
        {confirming && <Spinner aria-label="Verificando" />}
        {confirming ? "Verificando..." : confirmLabel}
      </Button>
    </form>
  );
};

export default TwoFactorSetupPanel;
