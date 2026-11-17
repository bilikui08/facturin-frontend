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
    <>
      <span className="text-nowrap">{formatInvoiceNumber(invoice)}</span>
      {isCreditNote(invoice) && (
        <span className="badge text-bg-danger ms-2 align-middle"
          title={originalNumber ? `Anula la factura ${originalNumber}` : "Nota de crédito"}>
          Nota de crédito
        </span>
      )}
      {creditNumber && (
        <span className="badge text-bg-secondary ms-2 align-middle"
          title={`Anulada por la nota de crédito ${creditNumber}`}>
          Anulada
        </span>
      )}
    </>
  );
};

export default InvoiceNumberCell;
