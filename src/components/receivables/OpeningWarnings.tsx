import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getOpeningWarnings } from "../../services/receivablesService";
import type { OpeningWarning } from "../../types/receivables";
import { formatDate, formatMoney } from "../../utils/invoiceFormat";
import { useQuery } from "../useQuery";

const describe = (w: OpeningWarning): string =>
  w.type === "historical_invoice_not_carried"
    ? `Anula ${w.invoice_number}, que no se cargó como pendiente: la nota (${formatMoney(w.credit_note_total)}) no figura en la cuenta corriente del cliente.`
    : `Anula ${w.invoice_number}, que se cargó por ${formatMoney(w.opening_amount)}: se acreditan ${formatMoney(w.applied)} y quedan ${formatMoney(w.excess)} sin aplicar.`;

/**
 * Notas de crédito emitidas después de la apertura sobre comprobantes anteriores que la cuenta corriente no pudo aplicar por completo.
 * Nunca se convierten solas en un crédito: hay que regularizarlas a mano.
 */
const OpeningWarnings = ({ version }: { version: number }) => {
  const { data } = useQuery((signal) => getOpeningWarnings(signal), [version], "No se pudieron cargar las advertencias");

  if (!data || data.length === 0) return null;

  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>Notas de crédito para regularizar a mano</AlertTitle>
      <AlertDescription>
        <p>Estas notas de crédito se emitieron después de la apertura sobre comprobantes anteriores y no se pudieron aplicar por completo.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {data.map((w) => (
            <li key={w.credit_note_id}>
              <span className="font-medium">{w.customer_name}</span> · {w.credit_note_number} ({formatDate(w.issue_date)}). {describe(w)}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

export default OpeningWarnings;
