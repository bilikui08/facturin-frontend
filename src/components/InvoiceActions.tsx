import { useState } from "react";
import { Ban, FileDown, ShieldCheck } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { P } from "../config/permissions";
import { useAccess } from "../hooks/useAccess";
import { apiRequest } from "../services/apiClient";
import type { InvoiceRow } from "../types/invoice";
import { formatInvoiceNumber, formatMoney, isCreditNote } from "../utils/invoiceFormat";

interface AfipVerification {
  approved: boolean;
  verified: boolean;
  matches: Record<string, boolean>;
}

type VerifyState =
  | { status: "ok"; data: AfipVerification }
  | { status: "error"; message: string };

const MATCH_LABELS: Record<string, string> = {
  cae: "CAE",
  cae_expiration: "Vto. CAE",
  voucher_date: "Fecha",
  total: "Total",
};

// Ancho fijo para que las columnas queden alineadas en todas las filas
const ACTION_BUTTON_CLASS = "w-[7rem] justify-center";

interface InvoiceActionsProps {
  invoice: InvoiceRow;
  /** Se llama después de emitir una nota de crédito, para que el listado se actualice. */
  onChanged?: () => void;
}

/** Botones "Imprimir PDF" y "Verificar en AFIP" de un comprobante emitido. */
const InvoiceActions = ({ invoice, onChanged }: InvoiceActionsProps) => {
  const id = invoice.id;
  const hasCae = Boolean(invoice.cae);
  // Se puede anular una factura autorizada que todavía no tiene nota de crédito
  const mayAnnul = useAccess().can(P.invoiceAnnul);
  const canAnnul = mayAnnul && hasCae && !isCreditNote(invoice) && !invoice.credit_note;
  const [annulling, setAnnulling] = useState(false);
  const [confirmingAnnul, setConfirmingAnnul] = useState(false);
  const [annulError, setAnnulError] = useState("");

  const [pdfLoading, setPdfLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verification, setVerification] = useState<VerifyState | null>(null);
  const [pdfError, setPdfError] = useState("");

  const handlePrintPdf = async () => {
    setPdfError("");
    setPdfLoading(true);
    // Se abre la pestaña de inmediato (dentro del click) para que el navegador no la bloquee.
    const pdfWindow = window.open("", "_blank");
    try {
      // URL firmada y temporal que termina en el nombre real del archivo
      // (ej. 20294823140_011_00001_00000029.pdf): así el navegador lo propone al guardar.
      const { url } = await apiRequest<{ url: string; file_name: string }>(
        `/invoices/${id}/pdf-link`,
      );
      if (pdfWindow) pdfWindow.location.replace(url);
      else window.open(url, "_blank");
    } catch (err) {
      pdfWindow?.close();
      setPdfError(err instanceof Error ? err.message : "No se pudo obtener el PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleAnnul = async () => {
    setAnnulError("");
    setAnnulling(true);
    try {
      await apiRequest(`/invoices/${id}/credit-note`, { method: "POST" });
      onChanged?.();
    } catch (err) {
      setAnnulError(err instanceof Error ? err.message : "No se pudo emitir la nota de crédito");
    } finally {
      setAnnulling(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const data = await apiRequest<AfipVerification>(`/invoices/${id}/afip-status`);
      setVerification({ status: "ok", data });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo verificar en AFIP";
      setVerification({ status: "error", message });
    } finally {
      setVerifying(false);
    }
  };

  const renderVerification = () => {
    if (!verification) return null;
    if (verification.status === "error") {
      return <div className="mt-1 text-xs text-destructive">{verification.message}</div>;
    }
    const { data } = verification;
    if (data.verified) {
      return (
        <div className="mt-1 text-xs font-medium text-success">✔ Verificado en AFIP (aprobado)</div>
      );
    }
    const differences = Object.entries(data.matches)
      .filter(([, ok]) => !ok)
      .map(([key]) => MATCH_LABELS[key] ?? key);
    return (
      <div className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
        {data.approved ? "⚠ AFIP aprobó el comprobante, pero hay diferencias" : "⚠ AFIP no lo aprobó"}
        {differences.length > 0 && `: ${differences.join(", ")}`}
      </div>
    );
  };

  // Tres posiciones fijas (PDF, Verificar, Anular) con el mismo ancho en todas las filas:
  // cuando "Anular" no aplica queda el hueco, así las columnas se mantienen alineadas.
  return (
    <div className="flex flex-col items-end">
      <div className="flex justify-end gap-1.5">
        <Button variant="outline" size="sm" type="button" className={ACTION_BUTTON_CLASS}
          title="Imprimir PDF" disabled={pdfLoading} onClick={handlePrintPdf}>
          <FileDown />
          {pdfLoading ? "..." : "PDF"}
        </Button>
        <Button variant="outline" size="sm" type="button" className={ACTION_BUTTON_CLASS}
          title="Verificar el comprobante en AFIP" disabled={verifying || !hasCae}
          onClick={handleVerify}>
          <ShieldCheck />
          {verifying ? "..." : "Verificar"}
        </Button>
        {canAnnul ? (
          <Button variant="outline" size="sm" type="button"
            className={`${ACTION_BUTTON_CLASS} text-destructive hover:text-destructive`}
            title="Anular con una nota de crédito" disabled={annulling}
            onClick={() => setConfirmingAnnul(true)}>
            <Ban />
            {annulling ? "..." : "Anular"}
          </Button>
        ) : (
          <span className={ACTION_BUTTON_CLASS} aria-hidden="true" />
        )}
      </div>
      {annulError && <div className="mt-1 text-right text-xs text-destructive">{annulError}</div>}
      {pdfError && <div className="mt-1 text-right text-xs text-destructive">{pdfError}</div>}
      {renderVerification()}

      <AlertDialog open={confirmingAnnul} onOpenChange={setConfirmingAnnul}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Anular la factura {formatInvoiceNumber(invoice)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se emitirá una Nota de Crédito C por {formatMoney(invoice.total)} ante AFIP, por el
              total del comprobante. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleAnnul()}
            >
              Anular comprobante
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InvoiceActions;
