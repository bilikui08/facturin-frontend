import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useGuardedAction } from "../../hooks/useGuardedAction";
import { useIdempotencyKey } from "../../hooks/useIdempotencyKey";
import { ApiError } from "../../services/apiClient";
import { allocatePayment, getAllocationSuggestion } from "../../services/paymentsService";
import type { AllocationLine, Payment, Suggestion, SuggestionLine, SuggestionOrder } from "../../types/payments";
import { formatDate, formatMoney } from "../../utils/invoiceFormat";
import { amountToCents, centsToAmount, filterAmountChars, parsePositiveAmount } from "../../utils/moneyInput";
import LoadingBlock from "../LoadingBlock";
import LoadingButton from "../LoadingButton";
import StatusAlert from "../StatusAlert";
import { useQuery } from "../useQuery";

const lineKey = (l: Pick<SuggestionLine, "kind" | "id">): string => `${l.kind}:${l.id}`;

/** Códigos del servidor que significan "los saldos cambiaron desde que se armó la propuesta": se vuelve a pedir. */
const STALE_CODES = new Set(["RECEIVABLES_ALLOCATION_EXCEEDS_PENDING", "RECEIVABLES_ALLOCATION_EXCEEDS_AVAILABLE", "RECEIVABLES_ALLOCATION_TARGET_INVALID"]);

interface AllocationFormProps {
  payment: Payment;
  onDone: (payment: Payment) => void;
  onClose: () => void;
}

const AllocationForm = ({ payment, onDone, onClose }: AllocationFormProps) => {
  const { pending, error, act } = useGuardedAction();
  const { keyFor, reset } = useIdempotencyKey();
  const [order, setOrder] = useState<SuggestionOrder>("issue_date");
  const [version, setVersion] = useState(0);
  // Lo que la persona cambió a mano, por deuda; lo que no tocó sigue siendo la propuesta
  const [typed, setTyped] = useState<Record<string, string>>({});

  const { data: suggestion, loading, error: loadError } = useQuery<Suggestion>(
    (signal) => getAllocationSuggestion(payment.customer_id, { paymentId: payment.id, order }, signal),
    [payment.id, order, version],
    "No se pudo cargar la propuesta de imputación",
  );

  const availableCents = amountToCents(payment.available);
  const lines = suggestion?.lines ?? [];

  /** Lo que se escribió (o se propuso) para una deuda: centavos, o null si no es un importe válido. Vacío = no imputar. */
  const centsFor = (l: SuggestionLine): number | null => {
    const raw = typed[lineKey(l)] ?? (amountToCents(l.suggested) > 0 ? l.suggested : "");
    if (raw.trim() === "") return 0;
    const parsed = parsePositiveAmount(raw);
    return parsed === null ? null : amountToCents(parsed);
  };
  const rawFor = (l: SuggestionLine): string => typed[lineKey(l)] ?? (amountToCents(l.suggested) > 0 ? l.suggested : "");

  const perLine = lines.map((l) => ({ line: l, cents: centsFor(l), pendingCents: amountToCents(l.pending) }));
  const anyInvalid = perLine.some((p) => p.cents === null || p.cents > p.pendingCents);
  const totalCents = perLine.reduce((sum, p) => sum + (p.cents ?? 0), 0);
  const overAvailable = totalCents > availableCents;
  const canSubmit = suggestion !== null && !anyInvalid && !overAvailable && totalCents > 0;

  const changeOrder = (next: SuggestionOrder) => {
    setOrder(next);
    setTyped({});
  };

  const submit = async () => {
    if (!canSubmit) return;

    const allocations: AllocationLine[] = perLine
      .filter((p) => (p.cents ?? 0) > 0)
      .map((p) => ({ [p.line.kind === "invoice" ? "invoice_id" : "opening_item_id"]: p.line.id, amount: centsToAmount(p.cents as number) }));

    // Las mismas líneas reenviadas llevan la misma clave: un doble envío no imputa dos veces
    const key = keyFor(JSON.stringify(allocations));
    const outcome = await act("allocate", () => allocatePayment(payment.id, allocations, key));

    if (outcome.ok) {
      reset();
      onDone(outcome.value);
    } else if (outcome.error instanceof ApiError && outcome.error.code && STALE_CODES.has(outcome.error.code)) {
      // Los saldos cambiaron (otra persona imputó, anuló, emitió una nota): se vuelve a pedir la propuesta
      setTyped({});
      setVersion((n) => n + 1);
    }
  };

  return (
    <div className="space-y-4">
      {loadError && <StatusAlert kind="error">{loadError}</StatusAlert>}
      {error && <StatusAlert kind="error">{error}</StatusAlert>}

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
        <div>
          <p className="text-muted-foreground">Cobro de {payment.customer_name}</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(payment.amount)}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-muted-foreground">Disponible para imputar</p>
          <p className="text-lg font-semibold tabular-nums">{formatMoney(payment.available)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted-foreground" htmlFor="allocation-order">Repartir empezando por lo más antiguo según</label>
        <NativeSelect id="allocation-order" size="sm" wrapperClassName="w-48" value={order} onChange={(e) => changeOrder(e.target.value as SuggestionOrder)}>
          <NativeSelectOption value="issue_date">Fecha de emisión</NativeSelectOption>
          <NativeSelectOption value="due_date">Fecha de vencimiento</NativeSelectOption>
        </NativeSelect>
        {Object.keys(typed).length > 0 && (
          <Button type="button" variant="ghost" size="sm" disabled={pending !== null} onClick={() => setTyped({})}>
            Restablecer propuesta
          </Button>
        )}
      </div>

      {loading && !suggestion ? (
        <LoadingBlock />
      ) : lines.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          El cliente no tiene deudas pendientes: el cobro queda como anticipo y se podrá imputar más adelante.
        </p>
      ) : (
        <ul className={`max-h-80 space-y-2 overflow-y-auto pr-1 ${loading ? "opacity-60" : ""}`}>
          {perLine.map(({ line, cents, pendingCents }) => {
            const tooMuch = cents !== null && cents > pendingCents;
            const invalid = cents === null || tooMuch;

            return (
              <li key={lineKey(line)} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_9rem_9rem] sm:items-start">
                <div>
                  <p className="font-medium">{line.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Emisión {formatDate(line.date)}
                    {line.due_date ? ` · vence ${formatDate(line.due_date)}` : ""}
                    {line.overdue && <Badge variant="destructive" className="ml-2">Vencida</Badge>}
                  </p>
                </div>
                <div className="text-sm sm:text-right">
                  <span className="text-muted-foreground sm:hidden">Pendiente: </span>
                  <span className="tabular-nums">{formatMoney(line.pending)}</span>
                </div>
                <div className="space-y-1">
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    aria-label={`Imputar a ${line.label}`}
                    aria-invalid={invalid || undefined}
                    value={rawFor(line)}
                    onChange={(e) => setTyped((current) => ({ ...current, [lineKey(line)]: filterAmountChars(e.target.value) }))}
                  />
                  {cents === null && <p className="text-xs text-destructive">Importe no válido</p>}
                  {tooMuch && <p className="text-xs text-destructive">Supera lo pendiente</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-1 rounded-lg border p-3 text-sm" aria-live="polite">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Se imputa</span>
          <span className="font-semibold tabular-nums">{formatMoney(centsToAmount(totalCents))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Queda como anticipo</span>
          <span className={`tabular-nums ${overAvailable ? "font-semibold text-destructive" : ""}`}>{formatMoney(centsToAmount(availableCents - totalCents))}</span>
        </div>
        {overAvailable && <p className="text-xs text-destructive">Lo que se imputa supera lo disponible del cobro.</p>}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending !== null} onClick={onClose}>
          {lines.length === 0 || totalCents === 0 ? "Dejar como anticipo" : "Cerrar sin imputar"}
        </Button>
        <LoadingButton type="button" loading={pending === "allocate"} loadingLabel="Imputando el cobro" disabled={pending !== null || !canSubmit} onClick={submit}>
          Imputar
        </LoadingButton>
      </DialogFooter>
    </div>
  );
};

interface AllocationDialogProps {
  /** El cobro a imputar; null: cerrado */
  payment: Payment | null;
  onDone: (payment: Payment) => void;
  onClose: () => void;
}

/** Imputar un cobro a las deudas del cliente, con la propuesta FIFO que se puede corregir antes de confirmar. */
const AllocationDialog = ({ payment, onDone, onClose }: AllocationDialogProps) => (
  <Dialog open={payment !== null} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Imputar cobro</DialogTitle>
        <DialogDescription>
          Se propone cancelar primero lo más antiguo. Podés cambiar los importes o dejar deudas sin tocar: lo que no imputes queda como anticipo.
        </DialogDescription>
      </DialogHeader>
      {payment && <AllocationForm key={payment.id} payment={payment} onDone={onDone} onClose={onClose} />}
    </DialogContent>
  </Dialog>
);

export default AllocationDialog;
