import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { InvoiceRow } from "../types/invoice";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney, isCreditNote } from "../utils/invoiceFormat";
import AfipEnvironmentBadge from "./AfipEnvironmentBadge";
import InvoiceActions from "./InvoiceActions";
import InvoiceNumberCell from "./InvoiceNumberCell";

interface InvoiceTableProps {
  invoices: InvoiceRow[];
  customerName: (invoice: InvoiceRow) => string;
  /** Se llama cuando una acción (ej. anular) cambia los datos, para volver a consultar. */
  onChanged?: () => void;
  /** Atenúa la tabla mientras se vuelve a consultar. */
  dimmed?: boolean;
}

/** Importe en formato argentino ($ 1.500,50). Las notas de crédito se muestran en negativo. */
const totalText = (invoice: InvoiceRow): string => {
  if (invoice.total == null) return "—";
  const amount = formatMoney(Math.abs(Number(invoice.total)));
  return isCreditNote(invoice) ? `−${amount}` : amount;
};

/** Listado de comprobantes emitidos (usado en "Facturar" y en la búsqueda). */
const InvoiceTable = ({ invoices, customerName, onChanged, dimmed }: InvoiceTableProps) => (
  <div className={cn("transition-opacity", dimmed && "opacity-60")}>
    <Table>
      <TableHeader className="bg-muted/50">
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Comprobante</TableHead>
          <TableHead>Ambiente</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead>Emitido por</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>CAE</TableHead>
          <TableHead>F. Vto. CAE</TableHead>
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((i) => (
          <TableRow key={i.id}>
            <TableCell>{formatDate(i.issue_date ?? i.created_at)}</TableCell>
            <TableCell>
              <InvoiceNumberCell invoice={i} />
            </TableCell>
            <TableCell>
              <AfipEnvironmentBadge environment={i.afip_environment} />
            </TableCell>
            <TableCell>{customerName(i)}</TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground" title="Usuario que emitió el comprobante">
              {i.created_by == null ? "—" : `Usuario ${i.created_by}`}
            </TableCell>
            <TableCell
              className={cn("text-right tabular-nums", isCreditNote(i) && "text-destructive")}
            >
              {totalText(i)}
            </TableCell>
            <TableCell className="font-mono text-xs">{String(i.cae ?? "—")}</TableCell>
            <TableCell>{formatDate(i.cae_expiration)}</TableCell>
            <TableCell className="text-right">
              <InvoiceActions invoice={i} onChanged={onChanged} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export default InvoiceTable;
