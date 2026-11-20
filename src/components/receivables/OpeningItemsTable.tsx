import { Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { voidOpeningItem } from "../../services/receivablesService";
import type { OpeningItem, OpeningState } from "../../types/receivables";
import { formatMoney } from "../../utils/invoiceFormat";
import LoadingButton from "../LoadingButton";
import type { OpeningActions } from "./types";

interface OpeningItemsTableProps extends OpeningActions {
  state: OpeningState;
  /** Solo en borrador y con permiso se puede anular una partida */
  canEdit: boolean;
}

const concept = (item: OpeningItem): string => item.invoice_number ?? item.description ?? "—";

/** Lo que cada cliente debía al abrir: las partidas cargadas (las anuladas se muestran tachadas, quedan como historial). */
const OpeningItemsTable = ({ state, canEdit, pending, act }: OpeningItemsTableProps) => (
  <Card className="gap-0 overflow-hidden py-0">
    <CardHeader className="border-b py-4 [.border-b]:pb-4">
      <CardTitle className="text-base">Lo que se debía al abrir</CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      {state.items.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">Todavía no se cargó ninguna partida. Si ningún cliente debía nada, se puede confirmar la apertura así.</p>
      ) : (
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Cliente y concepto</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              {canEdit && (
                <TableHead className="text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.items.map((item) => (
              <TableRow key={item.id} className={item.voided_at ? "text-muted-foreground" : undefined}>
                {/* Cliente y concepto en la misma celda: así en pantallas angostas el importe y el botón siempre se ven */}
                <TableCell className="whitespace-normal">
                  <p className="font-medium">{item.customer_name ?? `Cliente ${item.customer_id}`}</p>
                  <p className="text-sm text-muted-foreground">
                    <span className={item.voided_at ? "line-through" : undefined}>{concept(item)}</span>
                    {item.voided_at && <Badge variant="secondary" className="ml-2">Anulada</Badge>}
                  </p>
                </TableCell>
                <TableCell className={`text-right tabular-nums ${item.voided_at ? "line-through" : ""}`}>{formatMoney(item.amount)}</TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    {!item.voided_at && (
                      <LoadingButton
                        type="button"
                        variant="outline"
                        size="sm"
                        loading={pending === `void-${item.id}`}
                        loadingLabel={`Anulando ${concept(item)}`}
                        disabled={pending !== null}
                        aria-label={`Anular ${concept(item)}`}
                        onClick={() => act(`void-${item.id}`, () => voidOpeningItem(item.id))}
                      >
                        <Ban />
                        Anular
                      </LoadingButton>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total ({state.totals.items} {state.totals.items === 1 ? "partida" : "partidas"})</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatMoney(state.totals.amount)}</TableCell>
              {canEdit && <TableCell />}
            </TableRow>
          </TableFooter>
        </Table>
      )}
    </CardContent>
  </Card>
);

export default OpeningItemsTable;
