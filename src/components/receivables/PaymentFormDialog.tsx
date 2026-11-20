import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useGuardedAction } from "../../hooks/useGuardedAction";
import { useIdempotencyKey } from "../../hooks/useIdempotencyKey";
import { registerPayment } from "../../services/paymentsService";
import type { NewPayment, Payment, PaymentMethod } from "../../types/payments";
import { todayInArgentina } from "../../utils/dates";
import { formatDate, formatMoney } from "../../utils/invoiceFormat";
import { filterAmountChars, parsePositiveAmount } from "../../utils/moneyInput";
import DateInput from "../DateInput";
import FormField from "../FormField";
import LoadingButton from "../LoadingButton";
import StatusAlert from "../StatusAlert";
import { METHODS, METHOD_LABELS } from "./paymentLabels";
import { Button } from "@/components/ui/button";

export interface CustomerOption {
  id: number;
  name: string;
}

interface PaymentFormProps {
  customers: CustomerOption[] | null;
  customersError: string;
  /** Un cobro no puede ser anterior a la apertura de la cuenta corriente (yyyy-mm-dd) */
  openingDate: string;
  onRegistered: (payment: Payment) => void;
  onCancel: () => void;
}

const PaymentForm = ({ customers, customersError, openingDate, onRegistered, onCancel }: PaymentFormProps) => {
  const today = todayInArgentina();
  const { pending, error, act } = useGuardedAction();
  const { keyFor, reset } = useIdempotencyKey();
  const [customerId, setCustomerId] = useState("");
  const [rawAmount, setRawAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const amount = parsePositiveAmount(rawAmount);
  const dateError =
    date === "" ? "Ingresá una fecha válida." : date > today ? "La fecha no puede ser futura." : date < openingDate ? `No puede ser anterior a la apertura (${formatDate(openingDate)}).` : "";
  const valid = customerId !== "" && amount !== null && dateError === "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || amount === null) return;

    const payload: NewPayment = {
      customer_id: Number(customerId),
      amount,
      payment_date: date,
      method,
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    // Los mismos datos reenviados llevan la misma clave: un reintento nunca duplica el cobro
    const key = keyFor(JSON.stringify(payload));
    const outcome = await act("register", () => registerPayment(payload, key));

    if (outcome.ok) {
      reset();
      onRegistered(outcome.value);
    }
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      {customersError && <StatusAlert kind="error">{customersError}</StatusAlert>}
      {error && <StatusAlert kind="error">{error}</StatusAlert>}

      <FormField label="Cliente" htmlFor="payment-customer">
        <NativeSelect id="payment-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <NativeSelectOption value="">Elegí un cliente</NativeSelectOption>
          {(customers ?? []).map((c) => (
            <NativeSelectOption key={c.id} value={String(c.id)}>
              {c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Importe" htmlFor="payment-amount">
          <Input
            id="payment-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={rawAmount}
            aria-invalid={(amountTouched && rawAmount !== "" && amount === null) || undefined}
            onChange={(e) => setRawAmount(filterAmountChars(e.target.value))}
            onBlur={() => setAmountTouched(true)}
          />
          {amount !== null && <p className="text-xs text-muted-foreground">Se registrará {formatMoney(amount)}</p>}
          {amount === null && amountTouched && rawAmount !== "" && <p className="text-xs text-destructive">Importe no válido. Ej.: 1500,75</p>}
        </FormField>
        <FormField label="Fecha del cobro" htmlFor="payment-date">
          <DateInput id="payment-date" name="payment_date" value={date} onChange={(_, iso) => setDate(iso)} required />
          {dateError && <p className="text-xs text-destructive">{dateError}</p>}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Medio de pago" htmlFor="payment-method">
          <NativeSelect id="payment-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {METHODS.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {METHOD_LABELS[m]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Referencia (opcional)" htmlFor="payment-reference" hint="Número de transferencia, de cheque, de recibo…">
          <Input id="payment-reference" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} />
        </FormField>
      </div>

      <FormField label="Notas (opcional)" htmlFor="payment-notes">
        <Textarea id="payment-notes" className="min-h-16" maxLength={255} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </FormField>

      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending !== null} onClick={onCancel}>
          Cancelar
        </Button>
        <LoadingButton type="submit" loading={pending === "register"} loadingLabel="Registrando el cobro" disabled={pending !== null || !valid}>
          Registrar cobro
        </LoadingButton>
      </DialogFooter>
    </form>
  );
};

interface PaymentFormDialogProps extends Omit<PaymentFormProps, "onCancel"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Registrar un cobro (también un anticipo). El formulario se arma de cero cada vez que se abre. */
const PaymentFormDialog = ({ open, onOpenChange, ...form }: PaymentFormDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Registrar cobro</DialogTitle>
        <DialogDescription>
          Un cobro no es un comprobante: solo deja constancia de lo que el cliente pagó. Después podés imputarlo a las facturas que cancela o dejarlo como anticipo.
        </DialogDescription>
      </DialogHeader>
      <PaymentForm {...form} onCancel={() => onOpenChange(false)} />
    </DialogContent>
  </Dialog>
);

export default PaymentFormDialog;
