import { useState } from "react";
import { Ban, Undo2 } from "lucide-react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAccess } from "../../hooks/useAccess";
import { useGuardedAction } from "../../hooks/useGuardedAction";
import { P } from "../../config/permissions";
import { getPayment, releaseAllocation, voidPayment } from "../../services/paymentsService";
import type { Allocation, Payment } from "../../types/payments";
import { formatDate, formatMoney } from "../../utils/invoiceFormat";
import { formatDateTime } from "../../utils/auditFormat";
import FormField from "../FormField";
import LoadingBlock from "../LoadingBlock";
import LoadingButton from "../LoadingButton";
import StatusAlert from "../StatusAlert";
import { useQuery } from "../useQuery";
import { METHOD_LABELS } from "./paymentLabels";

const allocationState = (a: Allocation): { label: string; variant: "default" | "secondary" | "destructive" } =>
  a.released_at ? { label: "Liberada", variant: "secondary" } : a.effective ? { label: "Vigente", variant: "default" } : { label: "Sin efecto", variant: "secondary" };

interface DetailProps {
  id: number;
  /** Algo cambió (se liberó una imputación, se anuló el cobro): el listado se vuelve a pedir */
  onChanged: () => void;
  onAllocate: (payment: Payment) => void;
  onClose: () => void;
}

const PaymentDetail = ({ id, onChanged, onAllocate, onClose }: DetailProps) => {
  const { can } = useAccess();
  const [version, setVersion] = useState(0);
  const { pending, error, act } = useGuardedAction();
  const [releasing, setReleasing] = useState<Allocation | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");

  const { data: payment, loading, error: loadError } = useQuery((signal) => getPayment(id, signal), [id, version], "No se pudo cargar el cobro");

  if (loading && !payment) return <LoadingBlock />;
  if (!payment) return loadError ? <StatusAlert kind="error">{loadError}</StatusAlert> : null;

  const canAllocate = can(P.paymentAllocate) && payment.status === "confirmed" && Number(payment.available) > 0;
  const canVoid = can(P.paymentManage) && payment.status === "confirmed";
  const refresh = () => {
    setVersion((n) => n + 1);
    onChanged();
  };

  const release = async (allocation: Allocation) => {
    const outcome = await act(`release-${allocation.id}`, () => releaseAllocation(allocation.id));
    setReleasing(null);
    if (outcome.ok) refresh();
  };

  const confirmVoid = async () => {
    const outcome = await act("void", () => voidPayment(payment.id, reason.trim()));
    if (outcome.ok) {
      setVoiding(false);
      setReason("");
      refresh();
    }
  };

  return (
    <div className="space-y-4">
      {error && <StatusAlert kind="error">{error}</StatusAlert>}

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Cliente</dt><dd className="font-medium">{payment.customer_name}</dd></div>
        <div><dt className="text-muted-foreground">Fecha</dt><dd className="font-medium tabular-nums">{formatDate(payment.payment_date)}</dd></div>
        <div><dt className="text-muted-foreground">Medio</dt><dd className="font-medium">{METHOD_LABELS[payment.method]}{payment.reference ? ` · ${payment.reference}` : ""}</dd></div>
        <div><dt className="text-muted-foreground">Registrado por</dt><dd className="font-medium">{payment.created_by_name ?? "—"} {payment.created_at ? `· ${formatDateTime(payment.created_at)}` : ""}</dd></div>
        {payment.notes && <div className="sm:col-span-2"><dt className="text-muted-foreground">Notas</dt><dd>{payment.notes}</dd></div>}
      </dl>

      <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <div><p className="text-muted-foreground">Importe</p><p className="font-semibold tabular-nums">{formatMoney(payment.amount)}</p></div>
        <div><p className="text-muted-foreground">Imputado</p><p className="font-semibold tabular-nums">{formatMoney(payment.allocated)}</p></div>
        <div><p className="text-muted-foreground">Disponible</p><p className="font-semibold tabular-nums">{formatMoney(payment.available)}</p></div>
      </div>

      {payment.status === "voided" && (
        <StatusAlert kind="error">
          Cobro anulado {payment.voided_at ? `el ${formatDate(payment.voided_at)}` : ""}: {payment.void_reason}. Sus imputaciones quedaron liberadas.
        </StatusAlert>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Imputaciones</h3>
        {(payment.allocations ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no se imputó a ninguna deuda.</p>
        ) : (
          <ul className="space-y-2">
            {(payment.allocations ?? []).map((a) => {
              const state = allocationState(a);

              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">{a.target_label}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.created_at ? formatDateTime(a.created_at) : ""} {a.created_by_name ? `· ${a.created_by_name}` : ""}
                      {a.release_reason ? ` · ${a.release_reason}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">{formatMoney(a.amount)}</span>
                    <Badge variant={state.variant}>{state.label}</Badge>
                    {can(P.paymentAllocate) && a.effective && !a.released_at && (
                      <Button type="button" variant="outline" size="sm" disabled={pending !== null} aria-label={`Liberar imputación a ${a.target_label}`} onClick={() => setReleasing(a)}>
                        <Undo2 />
                        Liberar
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {(canAllocate || canVoid) && !voiding && (
        <div className="flex flex-wrap justify-end gap-2">
          {canVoid && (
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => setVoiding(true)}>
              <Ban />
              Anular cobro
            </Button>
          )}
          {canAllocate && (
            <Button type="button" disabled={pending !== null} onClick={() => onAllocate(payment)}>
              Imputar
            </Button>
          )}
        </div>
      )}

      {voiding && (
        <div className="space-y-3 rounded-lg border border-destructive/40 p-3">
          <p className="text-sm">
            Al anular el cobro se liberan sus imputaciones y deja de contar: el cliente vuelve a deber lo que había cancelado. Queda registrado y no se puede deshacer.
          </p>
          <FormField label="Motivo de la anulación" htmlFor="void-reason" hint="Mínimo 3 caracteres.">
            <Textarea id="void-reason" className="min-h-16" maxLength={255} value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => { setVoiding(false); setReason(""); }}>
              Volver
            </Button>
            <LoadingButton type="button" variant="destructive" loading={pending === "void"} loadingLabel="Anulando el cobro" disabled={pending !== null || reason.trim().length < 3} onClick={confirmVoid}>
              Anular cobro
            </LoadingButton>
          </div>
        </div>
      )}

      <AlertDialog open={releasing !== null} onOpenChange={(open) => !open && pending === null && setReleasing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Liberar esta imputación?</AlertDialogTitle>
            <AlertDialogDescription>
              {releasing && `${formatMoney(releasing.amount)} dejan de aplicarse a ${releasing.target_label}: esa deuda vuelve a figurar pendiente y el importe queda disponible en el cobro.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending !== null}>Volver</AlertDialogCancel>
            <LoadingButton type="button" loading={pending === `release-${releasing?.id}`} loadingLabel="Liberando la imputación" disabled={pending !== null} onClick={() => releasing && release(releasing)}>
              Sí, liberar
            </LoadingButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex justify-end">
        <Button type="button" variant="ghost" disabled={pending !== null} onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
};

interface PaymentDetailDialogProps extends Omit<DetailProps, "id"> {
  /** Cobro a mostrar; null: cerrado */
  paymentId: number | null;
}

const PaymentDetailDialog = ({ paymentId, ...rest }: PaymentDetailDialogProps) => (
  <Dialog open={paymentId !== null} onOpenChange={(open) => !open && rest.onClose()}>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Cobro #{paymentId}</DialogTitle>
        <DialogDescription>Detalle del cobro y de las deudas que cancela.</DialogDescription>
      </DialogHeader>
      {paymentId !== null && <PaymentDetail key={paymentId} id={paymentId} {...rest} />}
    </DialogContent>
  </Dialog>
);

export default PaymentDetailDialog;
