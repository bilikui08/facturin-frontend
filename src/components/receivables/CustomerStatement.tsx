import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAccountStatement, getCustomerBalance } from "../../services/receivablesService";
import type { BalanceStatus, StatementKind } from "../../types/statement";
import { formatDate, formatMoney } from "../../utils/invoiceFormat";
import DateInput from "../DateInput";
import LoadingBlock from "../LoadingBlock";
import StatusAlert from "../StatusAlert";
import { useQuery } from "../useQuery";

const PAGE_SIZES = [50, 100, 200];

const KIND_LABELS: Record<StatementKind, string> = {
  opening_item: "Saldo inicial",
  invoice: "Factura",
  credit_note: "Nota de crédito",
  payment: "Cobro",
  payment_void: "Cobro anulado",
};

/** Como en un resumen de cuenta: lo que suma deuda en neutro, lo que la baja en verde y la anulación de un cobro en rojo. */
const KIND_ROW: Record<StatementKind, string> = {
  opening_item: "",
  invoice: "",
  credit_note: "bg-emerald-50/60 dark:bg-emerald-950/20",
  payment: "bg-emerald-50/60 dark:bg-emerald-950/20",
  payment_void: "bg-red-50/60 dark:bg-red-950/20",
};

const STATUS_TEXT: Record<BalanceStatus, { label: string; tone: string }> = {
  debtor: { label: "El cliente debe", tone: "text-destructive" },
  creditor: { label: "Saldo a favor del cliente", tone: "text-emerald-700 dark:text-emerald-400" },
  even: { label: "Cuenta al día", tone: "text-muted-foreground" },
};

const isZero = (amount: string) => Number(amount) === 0;

const Stat = ({ label, value, hint, tone = "" }: { label: string; value: string; hint?: string; tone?: string }) => (
  <div className="rounded-lg border bg-card p-4">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
    {hint && <p className={`mt-1 text-xs ${tone || "text-muted-foreground"}`}>{hint}</p>}
  </div>
);

/** Estado de cuenta de un cliente: saldos, y todos sus movimientos (facturas, notas de crédito, cobros) con el saldo después de cada uno. */
const CustomerStatement = () => {
  const { id } = useParams();
  const customerId = Number(id);

  // Un id que no es un número no consulta nada
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return (
      <section className="space-y-4">
        <BackButton />
        <StatusAlert kind="error">El cliente no existe.</StatusAlert>
      </section>
    );
  }

  return <StatementView customerId={customerId} />;
};

const BackButton = () => {
  const navigate = useNavigate();

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => navigate(-1)}>
      <ArrowLeft />
      Volver
    </Button>
  );
};

const StatementView = ({ customerId }: { customerId: number }) => {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZES[0]);

  const { data: balance, error: balanceError } = useQuery(
    (signal) => getCustomerBalance(customerId, signal),
    [customerId],
    "No se pudo cargar el saldo del cliente",
  );
  const { data: statement, loading, error } = useQuery(
    (signal) => getAccountStatement(customerId, { from: dateFrom, to: dateTo, page, perPage }, signal),
    [customerId, dateFrom, dateTo, page, perPage],
    "No se pudo cargar el estado de cuenta",
  );

  const resetPage = (change: () => void) => {
    change();
    setPage(1);
  };

  const lines = statement?.lines ?? [];
  const meta = statement?.meta;
  const filtered = Boolean(dateFrom || dateTo);
  const status = balance ? STATUS_TEXT[balance.status] : null;
  const firstPage = (meta?.page ?? 1) === 1;
  const lastPage = (meta?.page ?? 1) >= (meta?.last_page ?? 1);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{statement?.customer.name ?? "Estado de cuenta"}</h2>
          <p className="text-sm text-muted-foreground">Estado de cuenta · pesos argentinos</p>
        </div>
        <BackButton />
      </div>

      {balanceError && <StatusAlert kind="error">{balanceError}</StatusAlert>}
      {error && <StatusAlert kind="error">{error}</StatusAlert>}

      {balance && status && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Saldos del cliente">
          <Stat label="Saldo de la cuenta" value={formatMoney(balance.balance)} hint={status.label} tone={status.tone} />
          <Stat label="Pendiente de facturas" value={formatMoney(balance.pending)} hint="Lo que falta cobrar de sus comprobantes" />
          <Stat label="Cobros a favor sin imputar" value={formatMoney(balance.available_credit)} hint="Anticipos disponibles para aplicar" />
        </div>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 border-b py-4 sm:flex-row sm:flex-wrap sm:items-end [.border-b]:pb-4">
          <CardTitle className="mr-auto text-base">Movimientos</CardTitle>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Desde</span>
              <DateInput name="statement_from" value={dateFrom} onChange={(_, iso) => resetPage(() => setDateFrom(iso))} />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Hasta</span>
              <DateInput name="statement_to" value={dateTo} onChange={(_, iso) => resetPage(() => setDateTo(iso))} />
            </div>
            {filtered && (
              <Button type="button" variant="ghost" size="sm" onClick={() => resetPage(() => { setDateFrom(""); setDateTo(""); })}>
                Ver todo
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading && !statement ? (
            <LoadingBlock />
          ) : !statement ? null : lines.length === 0 && isZero(statement.opening_balance) ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
              <FileText className="size-10 opacity-40" aria-hidden="true" />
              <p>{filtered ? "No hay movimientos en ese período." : "Este cliente todavía no tiene movimientos en la cuenta corriente."}</p>
            </div>
          ) : (
            <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead className="text-right sm:hidden">Importe</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Débito</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Crédito</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered && firstPage && (
                    <TableRow className="bg-muted/30 font-medium">
                      <TableCell className="hidden sm:table-cell" />
                      <TableCell>Saldo anterior al período</TableCell>
                      <TableCell className="sm:hidden" />
                      <TableCell className="hidden sm:table-cell" />
                      <TableCell className="hidden sm:table-cell" />
                      <TableCell className="text-right tabular-nums">{formatMoney(statement.opening_balance)}</TableCell>
                    </TableRow>
                  )}
                  {lines.map((line) => (
                    <TableRow key={`${line.kind}-${line.source_id}`} className={KIND_ROW[line.kind]}>
                      <TableCell className="hidden whitespace-nowrap tabular-nums sm:table-cell">{formatDate(line.date)}</TableCell>
                      <TableCell className="whitespace-normal">
                        <p className={line.kind === "payment_void" ? "font-medium text-destructive" : "font-medium"}>{line.concept}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="tabular-nums sm:hidden">{formatDate(line.date)} · </span>
                          <Badge variant="outline" className="mr-1 align-middle">{KIND_LABELS[line.kind]}</Badge>
                          {line.note}
                        </p>
                      </TableCell>
                      {/* En pantallas chicas Debe y Haber se juntan en un importe con signo, para que el saldo quede a la vista */}
                      <TableCell className="text-right tabular-nums sm:hidden">{isZero(line.credit) ? formatMoney(line.debit) : `−${formatMoney(line.credit)}`}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{isZero(line.debit) ? "" : formatMoney(line.debit)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{isZero(line.credit) ? "" : formatMoney(line.credit)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(line.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="hidden sm:table-cell" />
                    <TableCell className="font-medium">{filtered ? "Total del período" : "Totales"}</TableCell>
                    <TableCell className="sm:hidden" />
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMoney(statement.debit)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMoney(statement.credit)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatMoney(statement.closing_balance)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>

        {meta && meta.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
            <span>{meta.total} {meta.total === 1 ? "movimiento" : "movimientos"}</span>
            <div className="flex items-center gap-2">
              <label htmlFor="statement-per-page" className="sr-only">Movimientos por página</label>
              <NativeSelect id="statement-per-page" size="sm" wrapperClassName="w-24" value={String(perPage)} onChange={(e) => resetPage(() => setPerPage(Number(e.target.value)))}>
                {PAGE_SIZES.map((n) => <NativeSelectOption key={n} value={String(n)}>{n}</NativeSelectOption>)}
              </NativeSelect>
              <Button type="button" variant="outline" size="icon" aria-label="Página anterior" disabled={firstPage} onClick={() => setPage((n) => n - 1)}>
                <ChevronLeft />
              </Button>
              <span className="tabular-nums">{meta.page} / {meta.last_page}</span>
              <Button type="button" variant="outline" size="icon" aria-label="Página siguiente" disabled={lastPage} onClick={() => setPage((n) => n + 1)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
};

export default CustomerStatement;
