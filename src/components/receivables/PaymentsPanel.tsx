import { useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, HandCoins, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { P } from "../../config/permissions";
import { useAccess } from "../../hooks/useAccess";
import { getResources } from "../../services/crudService";
import { listPayments } from "../../services/paymentsService";
import type { Resource } from "../../types/crud";
import type { Payment, PaymentStatus } from "../../types/payments";
import { formatDate, formatMoney } from "../../utils/invoiceFormat";
import DateInput from "../DateInput";
import LoadingBlock from "../LoadingBlock";
import StatusAlert from "../StatusAlert";
import { useQuery } from "../useQuery";
import AllocationDialog from "./AllocationDialog";
import PaymentDetailDialog from "./PaymentDetailDialog";
import PaymentFormDialog, { type CustomerOption } from "./PaymentFormDialog";
import { METHOD_LABELS } from "./paymentLabels";

const PAGE_SIZES = [20, 50, 100];

interface PaymentsPanelProps {
  /** Fecha de apertura de la cuenta corriente (yyyy-mm-dd): ningún cobro puede ser anterior */
  openingDate: string;
}

/** Cobros de clientes: listado con filtros, registrar un cobro, imputarlo a las deudas, ver su detalle y anularlo. */
const PaymentsPanel = ({ openingDate }: PaymentsPanelProps) => {
  const { can } = useAccess();
  const canManage = can(P.paymentManage);
  const canAllocate = can(P.paymentAllocate);
  const [reload, setReload] = useState(0);
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZES[0]);
  const [formOpen, setFormOpen] = useState(false);
  const [allocating, setAllocating] = useState<Payment | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const { data, loading, error } = useQuery(
    (signal) => listPayments({ customerId, status, dateFrom, dateTo, page, perPage }, signal),
    [reload, customerId, status, dateFrom, dateTo, page, perPage],
    "No se pudieron cargar los cobros",
  );

  // La lista de clientes solo la puede pedir quien tenga permiso (la misma regla que GET /customers); sin él no se pide y el listado funciona igual
  const canListCustomers = can(P.customerView, P.customerManage, P.invoiceIssue);
  const { data: customerList, error: customersLoadError } = useQuery(
    () => (canListCustomers ? getResources<Resource[]>("/customers") : Promise.resolve(null)),
    [canListCustomers],
    "No se pudieron cargar los clientes",
  );
  const customers: CustomerOption[] | null = customerList ? customerList.map((c) => ({ id: Number(c.id), name: String(c.name ?? c.id) })) : null;
  const customersError = canListCustomers ? customersLoadError : "Para registrar cobros necesitás poder ver los clientes. Pedile a la persona que administra tu empresa que te lo habilite.";

  const items = data?.items ?? [];
  const meta = data?.meta;
  const refresh = () => setReload((n) => n + 1);
  const resetPage = (change: () => void) => {
    change();
    setPage(1);
  };

  const registered = (payment: Payment) => {
    setFormOpen(false);
    setNotice(`Cobro #${payment.id} registrado.`);
    refresh();
    // Lo natural es aplicarlo enseguida a las deudas; si no se quiere, queda como anticipo
    if (canAllocate) setAllocating(payment);
  };

  const allocated = (payment: Payment) => {
    setAllocating(null);
    setNotice(`Cobro #${payment.id} imputado.`);
    refresh();
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-muted-foreground">
          Los cobros de tus clientes. Un cobro sin imputar es un anticipo: queda a favor del cliente hasta que lo apliques a una factura.
        </p>
        {canManage && (
          <Button type="button" onClick={() => { setNotice(""); setFormOpen(true); }}>
            <Plus />
            Registrar cobro
          </Button>
        )}
      </div>

      {error && <StatusAlert kind="error">{error}</StatusAlert>}
      {notice && <StatusAlert kind="success">{notice}</StatusAlert>}

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 border-b py-4 sm:flex-row sm:flex-wrap sm:items-end [.border-b]:pb-4">
          <CardTitle className="mr-auto text-base">Cobros registrados</CardTitle>
          <div className="flex flex-wrap items-end gap-3">
            {customers && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="payments-customer">Cliente</label>
                <NativeSelect id="payments-customer" size="sm" wrapperClassName="w-48" value={customerId} onChange={(e) => resetPage(() => setCustomerId(e.target.value))}>
                  <NativeSelectOption value="">Todos</NativeSelectOption>
                  {customers.map((c) => (
                    <NativeSelectOption key={c.id} value={String(c.id)}>{c.name}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="payments-status">Estado</label>
              <NativeSelect id="payments-status" size="sm" wrapperClassName="w-36" value={status} onChange={(e) => resetPage(() => setStatus(e.target.value as PaymentStatus | ""))}>
                <NativeSelectOption value="">Todos</NativeSelectOption>
                <NativeSelectOption value="confirmed">Confirmados</NativeSelectOption>
                <NativeSelectOption value="voided">Anulados</NativeSelectOption>
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Desde</span>
              <DateInput name="date_from" value={dateFrom} onChange={(_, iso) => resetPage(() => setDateFrom(iso))} />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Hasta</span>
              <DateInput name="date_to" value={dateTo} onChange={(_, iso) => resetPage(() => setDateTo(iso))} />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading && !data ? (
            <LoadingBlock />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
              <HandCoins className="size-10 opacity-40" aria-hidden="true" />
              <p>{customerId || status || dateFrom || dateTo ? "No hay cobros con esos filtros." : "Todavía no se registró ningún cobro."}</p>
            </div>
          ) : (
            <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Cobro</TableHead>
                    <TableHead className="text-right">Importe</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p) => {
                    const hasAvailable = p.status === "confirmed" && Number(p.available) > 0;

                    return (
                      <TableRow key={p.id}>
                        <TableCell className="whitespace-normal">
                          <p className="font-medium">
                            <Link to={`/dashboard/receivables/customer/${p.customer_id}`} className="hover:underline" title="Ver estado de cuenta">
                              {p.customer_name}
                            </Link>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            <span className="tabular-nums">{formatDate(p.payment_date)}</span> · {METHOD_LABELS[p.method]}
                            {p.reference ? ` · ${p.reference}` : ""} · #{p.id}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <p className={p.status === "voided" ? "line-through text-muted-foreground" : "font-medium"}>{formatMoney(p.amount)}</p>
                          {p.status === "confirmed" && <p className="text-xs text-muted-foreground">Disponible {formatMoney(p.available)}</p>}
                        </TableCell>
                        <TableCell>
                          {p.status === "voided" ? <Badge variant="secondary">Anulado</Badge> : hasAvailable ? <Badge variant="outline">Con saldo a imputar</Badge> : <Badge>Imputado</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {hasAvailable && canAllocate && (
                              <Button type="button" size="sm" aria-label={`Imputar cobro ${p.id}`} onClick={() => { setNotice(""); setAllocating(p); }}>
                                Imputar
                              </Button>
                            )}
                            <Button type="button" variant="outline" size="sm" aria-label={`Ver cobro ${p.id}`} onClick={() => setDetailId(p.id)}>
                              Ver
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

        {meta && meta.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
            <span>{meta.total} {meta.total === 1 ? "cobro" : "cobros"}</span>
            <div className="flex items-center gap-2">
              <label htmlFor="payments-per-page">Por página</label>
              <NativeSelect id="payments-per-page" size="sm" wrapperClassName="w-20" value={String(perPage)} onChange={(e) => resetPage(() => setPerPage(Number(e.target.value)))}>
                {PAGE_SIZES.map((n) => (
                  <NativeSelectOption key={n} value={String(n)}>{n}</NativeSelectOption>
                ))}
              </NativeSelect>
              <Button type="button" variant="outline" size="icon" aria-label="Página anterior" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft />
              </Button>
              <span className="tabular-nums">{meta.page} / {meta.last_page}</span>
              <Button type="button" variant="outline" size="icon" aria-label="Página siguiente" disabled={page >= meta.last_page} onClick={() => setPage(page + 1)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <PaymentFormDialog open={formOpen} onOpenChange={setFormOpen} customers={customers} customersError={customersError} openingDate={openingDate} onRegistered={registered} />
      <AllocationDialog payment={allocating} onDone={allocated} onClose={() => setAllocating(null)} />
      <PaymentDetailDialog
        paymentId={detailId}
        onChanged={refresh}
        onAllocate={(payment) => { setDetailId(null); setAllocating(payment); }}
        onClose={() => setDetailId(null)}
      />
    </section>
  );
};

export default PaymentsPanel;
