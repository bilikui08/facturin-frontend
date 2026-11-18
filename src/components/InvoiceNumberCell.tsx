import { Badge } from "@/components/ui/badge";
import type { InvoiceRow } from "../types/invoice";
import { formatInvoiceNumber, isCreditNote } from "../utils/invoiceFormat";

interface InvoiceNumberCellProps {
  invoice: InvoiceRow;
}

/** Número del comprobante, con etiquetas que indican si es una nota de crédito o una factura anulada. */
const InvoiceNumberCell = ({ invoice }: InvoiceNumberCellProps) => {
  const pv = String(invoice.sale_point?.number ?? "").padStart(4, "0");
  const creditNumber = invoice.credit_note
    ? `${pv}-${String(invoice.credit_note.cbte_nro).padStart(8, "0")}`
    : null;
  const originalNumber = invoice.associated_invoice
    ? `${pv}-${String(invoice.associated_invoice.cbte_nro).padStart(8, "0")}`
    : null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="whitespace-nowrap font-mono text-sm">{formatInvoiceNumber(invoice)}</span>
      {isCreditNote(invoice) && (
        <Badge
          variant="destructive"
          title={originalNumber ? `Anula la factura ${originalNumber}` : "Nota de crédito"}
        >
          Nota de crédito
        </Badge>
      )}
      {creditNumber && (
        <Badge variant="secondary" title={`Anulada por la nota de crédito ${creditNumber}`}>
          Anulada
        </Badge>
      )}
    </div>
  );
};

export default InvoiceNumberCell;
