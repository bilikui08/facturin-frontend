import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addOpeningItem, getOpeningCandidates } from "../../services/receivablesService";
import type { CandidateGroup, CandidateInvoice } from "../../types/receivables";
import { formatDate, formatMoney } from "../../utils/invoiceFormat";
import { filterAmountChars, parsePositiveAmount } from "../../utils/moneyInput";
import LoadingBlock from "../LoadingBlock";
import LoadingButton from "../LoadingButton";
import StatusAlert from "../StatusAlert";
import { useQuery } from "../useQuery";
import type { OpeningActions } from "./types";

interface OpeningCandidatesProps extends OpeningActions {
  /** Cambia cuando cambian las partidas ya cargadas (llegó el estado nuevo): la lista de pendientes se vuelve a pedir */
  itemsKey: string;
}

/**
 * Comprobantes emitidos antes de la apertura. Los que el cliente todavía debe se cargan como pendientes (por el importe que falta, que
 * puede ser menos que el total si ya pagó una parte). Lo que no se carga se considera saldado.
 */
const OpeningCandidates = ({ itemsKey, pending, act }: OpeningCandidatesProps) => {
  const { data, loading, error } = useQuery((signal) => getOpeningCandidates(signal), [itemsKey], "No se pudieron cargar los comprobantes anteriores");
  // Lo que se escribe en cada campo, tal cual; se interpreta al cargar (ver utils/moneyInput)
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [touched, setTouched] = useState<ReadonlySet<number>>(new Set());

  const rawOf = (invoice: CandidateInvoice): string => typed[invoice.invoice_id] ?? invoice.total;
  /** El importe a cargar ("300.50"), o null si lo escrito no es válido o supera el total del comprobante */
  const amountOf = (invoice: CandidateInvoice): string | null => {
    const amount = parsePositiveAmount(rawOf(invoice));
    return amount !== null && Number(amount) <= Number(invoice.total) ? amount : null;
  };

  const load = (group: CandidateGroup, invoice: CandidateInvoice) => {
    const amount = amountOf(invoice);
    return amount === null ? Promise.resolve(false) : act(`candidate-${invoice.invoice_id}`, () => addOpeningItem({ customer_id: group.customer_id, invoice_id: invoice.invoice_id, amount }));
  };

  // Todas las de un cliente con su total, una por una: si alguna falla se corta ahí y las anteriores quedan cargadas
  const loadAll = (group: CandidateGroup) =>
    act(`group-${group.customer_id}`, async () => {
      for (const invoice of group.invoices) {
        await addOpeningItem({ customer_id: group.customer_id, invoice_id: invoice.invoice_id, amount: invoice.total });
      }
    });

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-4 [.border-b]:pb-4">
        <CardTitle className="text-base">Comprobantes anteriores a la apertura</CardTitle>
        <CardDescription>
          Cargá los que el cliente todavía debe, con el importe que falta. Los que no cargues se consideran cobrados: no aparecen en la cuenta corriente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-4">
        {error && <StatusAlert kind="error">{error}</StatusAlert>}
        {loading && !data ? (
          <LoadingBlock />
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay comprobantes anteriores pendientes de cargar.</p>
        ) : (
          (data ?? []).map((group) => (
            <div key={group.customer_id} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">{group.customer_name}</h3>
                {group.invoices.length > 1 && (
                  <LoadingButton
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={pending === `group-${group.customer_id}`}
                    loadingLabel={`Cargando los comprobantes de ${group.customer_name}`}
                    disabled={pending !== null}
                    onClick={() => loadAll(group)}
                  >
                    Cargar todos con su total
                  </LoadingButton>
                )}
              </div>
              {/* Filas con grilla: en pantallas muy anchas (con el menú lateral abierto la grilla necesita ~780 px) las columnas de todos los clientes quedan alineadas; en angostas cada comprobante es una tarjeta */}
              <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <div className="hidden gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm font-medium xl:grid xl:grid-cols-[1fr_6.5rem_8rem_12rem_5.5rem]" aria-hidden="true">
                  <span>Comprobante</span>
                  <span>Emisión</span>
                  <span className="text-right">Total</span>
                  <span>Pendiente</span>
                  <span />
                </div>
                <ul className="space-y-2 xl:space-y-0">
                  {group.invoices.map((invoice) => {
                    const amount = amountOf(invoice);
                    const raw = rawOf(invoice);
                    const showError = amount === null && (touched.has(invoice.invoice_id) || raw === "");

                    return (
                      <li
                        key={invoice.invoice_id}
                        className="grid gap-2 rounded-md border p-3 xl:grid-cols-[1fr_6.5rem_8rem_12rem_5.5rem] xl:items-start xl:gap-3 xl:rounded-none xl:border-0 xl:border-b xl:px-3 xl:py-2"
                      >
                        <span className="font-medium xl:pt-2">{invoice.number}</span>
                        <span className="tabular-nums text-muted-foreground xl:pt-2 xl:text-foreground">
                          <span className="xl:hidden">Emisión: </span>
                          {formatDate(invoice.issue_date)}
                        </span>
                        <span className="tabular-nums text-muted-foreground xl:pt-2 xl:text-right xl:text-foreground">
                          <span className="xl:hidden">Total: </span>
                          {formatMoney(invoice.total)}
                        </span>
                        <div className="space-y-1">
                          <span className="text-sm text-muted-foreground xl:hidden">Pendiente a cargar</span>
                          <Input
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label={`Pendiente de ${invoice.number}`}
                            aria-invalid={amount === null || undefined}
                            value={raw}
                            onChange={(e) => setTyped((current) => ({ ...current, [invoice.invoice_id]: filterAmountChars(e.target.value) }))}
                            onBlur={() => setTouched((current) => new Set(current).add(invoice.invoice_id))}
                          />
                          {amount !== null && amount !== raw && <p className="text-xs text-muted-foreground">Se carga {formatMoney(amount)}</p>}
                          {showError && (
                            <p className="text-xs text-destructive">
                              {parsePositiveAmount(raw) === null ? "Importe no válido. Ej.: 1500,75" : `No puede superar el total (${formatMoney(invoice.total)})`}
                            </p>
                          )}
                        </div>
                        <div className="xl:text-right xl:pt-0.5">
                          <LoadingButton
                            type="button"
                            size="sm"
                            loading={pending === `candidate-${invoice.invoice_id}`}
                            loadingLabel={`Cargando ${invoice.number}`}
                            disabled={pending !== null || amount === null}
                            aria-label={`Cargar ${invoice.number}`}
                            onClick={() => load(group, invoice)}
                          >
                            Cargar
                          </LoadingButton>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default OpeningCandidates;
