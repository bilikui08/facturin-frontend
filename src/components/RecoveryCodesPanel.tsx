import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface RecoveryCodesPanelProps {
  codes: string[];
  onDone: () => void;
  doneLabel: string;
}

/**
 * Códigos de recuperación: se ven UNA sola vez. Sirven (cada uno una vez) si se pierde el celular. Hasta que la persona confirma
 * que los guardó no se puede seguir.
 */
const RecoveryCodesPanel = ({ codes, onDone, doneLabel }: RecoveryCodesPanelProps) => {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // sin permiso de portapapeles: los códigos están a la vista
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([`Códigos de recuperación (cada uno sirve una sola vez)\n\n${codes.join("\n")}\n`], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "codigos-de-recuperacion.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Guardalos en un lugar seguro. Si perdés el celular, cada código te deja ingresar <strong>una vez</strong>. No se vuelven a mostrar.
      </p>

      <ul aria-label="Códigos de recuperación" className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3 font-mono text-sm">
        {codes.map((code) => (
          <li key={code} className="text-center tracking-wider">
            {code}
          </li>
        ))}
      </ul>

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? "Copiados" : "Copiar"}
        </Button>
        <Button type="button" variant="outline" className="flex-1" onClick={download}>
          <Download aria-hidden="true" />
          Descargar
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="recovery-saved" checked={saved} onCheckedChange={(checked) => setSaved(checked === true)} />
        <Label htmlFor="recovery-saved" className="font-normal">
          Ya guardé mis códigos de recuperación
        </Label>
      </div>

      <Button type="button" className="w-full" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
};

export default RecoveryCodesPanel;
