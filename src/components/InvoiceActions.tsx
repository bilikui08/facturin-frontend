import { useState } from "react";
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

const ACTION_BUTTON_STYLE = { width: 78, display: "inline-block", textAlign: "center" } as const;

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
  const canAnnul = hasCae && !isCreditNote(invoice) && !invoice.credit_note;
  const [annulling, setAnnulling] = useState(false);
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
    const confirmed = window.confirm(
      `¿Anular la factura ${formatInvoiceNumber(invoice)} por ${formatMoney(invoice.total)}?\n\n` +
        "Se emitirá una Nota de Crédito C por el total ante AFIP. Esta acción no se puede deshacer.",
    );
    if (!confirmed) return;

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
      return <div className="small text-danger mt-1">{verification.message}</div>;
    }
    const { data } = verification;
    if (data.verified) {
      return <div className="small text-success mt-1">✔ Verificado en AFIP (aprobado)</div>;
    }
    const differences = Object.entries(data.matches)
      .filter(([, ok]) => !ok)
      .map(([key]) => MATCH_LABELS[key] ?? key);
    return (
      <div className="small text-warning-emphasis mt-1">
        {data.approved ? "⚠ AFIP aprobó el comprobante, pero hay diferencias" : "⚠ AFIP no lo aprobó"}
        {differences.length > 0 && `: ${differences.join(", ")}`}
      </div>
    );
  };

  // Tres posiciones fijas (PDF, Verificar, Anular) con el mismo ancho en todas las filas:
  // cuando "Anular" no aplica queda el hueco, así las columnas se mantienen alineadas.
  return (
    <div className="d-flex flex-column align-items-end">
      <div className="d-flex gap-1 justify-content-end">
        <button className="btn btn-outline-primary btn-sm" type="button"
          style={ACTION_BUTTON_STYLE} title="Imprimir PDF"
          disabled={pdfLoading} onClick={handlePrintPdf}>
          {pdfLoading ? "..." : "PDF"}
        </button>
        <button className="btn btn-outline-secondary btn-sm" type="button"
          style={ACTION_BUTTON_STYLE} title="Verificar el comprobante en AFIP"
          disabled={verifying || !hasCae} onClick={handleVerify}>
          {verifying ? "..." : "Verificar"}
        </button>
        {canAnnul ? (
          <button className="btn btn-outline-danger btn-sm" type="button"
            style={ACTION_BUTTON_STYLE} title="Anular con una nota de crédito"
            disabled={annulling} onClick={handleAnnul}>
            {annulling ? "..." : "Anular"}
          </button>
        ) : (
          <span style={ACTION_BUTTON_STYLE} aria-hidden="true" />
        )}
      </div>
      {annulError && <div className="small text-danger mt-1 text-end">{annulError}</div>}
      {pdfError && <div className="small text-danger mt-1 text-end">{pdfError}</div>}
      {renderVerification()}
    </div>
  );
};

export default InvoiceActions;
