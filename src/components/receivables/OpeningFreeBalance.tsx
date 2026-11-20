import { useState, type FormEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { getResources } from "../../services/crudService";
import { addOpeningItem } from "../../services/receivablesService";
import type { Resource } from "../../types/crud";
import { formatMoney } from "../../utils/invoiceFormat";
import { filterAmountChars, parsePositiveAmount } from "../../utils/moneyInput";
import FormField from "../FormField";
import LoadingButton from "../LoadingButton";
import StatusAlert from "../StatusAlert";
import { useQuery } from "../useQuery";
import type { OpeningActions } from "./types";

/** Un saldo que no corresponde a un comprobante (por ejemplo, lo que figuraba en una planilla anterior): cliente, importe y de qué es. */
const OpeningFreeBalance = ({ pending, act }: OpeningActions) => {
  const { data: customers, error } = useQuery((signal) => getResources<Resource[]>("/customers").then((list) => (signal.aborted ? [] : list)), [], "No se pudieron cargar los clientes");
  const [customerId, setCustomerId] = useState("");
  const [raw, setRaw] = useState("");
  const [touched, setTouched] = useState(false);
  const [description, setDescription] = useState("");

  // Lo escrito se interpreta recién acá y se muestra qué se va a cargar
  const amount = parsePositiveAmount(raw);
  const valid = customerId !== "" && amount !== null && description.trim() !== "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || amount === null) return;

    const done = await act("free", () => addOpeningItem({ customer_id: Number(customerId), amount, description: description.trim() }));
    if (done) {
      setRaw("");
      setTouched(false);
      setDescription("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Saldo sin comprobante</CardTitle>
        <CardDescription>Para una deuda anterior que no corresponde a ningún comprobante emitido en el sistema.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <StatusAlert kind="error" className="mb-4">{error}</StatusAlert>}
        <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_1.5fr_auto] lg:items-end" onSubmit={submit}>
          <FormField label="Cliente" htmlFor="free-customer">
            <NativeSelect id="free-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <NativeSelectOption value="">Elegí un cliente</NativeSelectOption>
              {(customers ?? []).map((c) => (
                <NativeSelectOption key={c.id} value={String(c.id)}>
                  {String(c.name ?? c.id)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Importe" htmlFor="free-amount">
            <Input
              id="free-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={raw}
              aria-invalid={(touched && raw !== "" && amount === null) || undefined}
              onChange={(e) => setRaw(filterAmountChars(e.target.value))}
              onBlur={() => setTouched(true)}
            />
            {amount !== null && <p className="text-xs text-muted-foreground">Se cargará {formatMoney(amount)}</p>}
            {amount === null && touched && raw !== "" && <p className="text-xs text-destructive">Importe no válido. Ej.: 1500,75</p>}
          </FormField>
          <FormField label="De qué es" htmlFor="free-description">
            <Input id="free-description" maxLength={255} placeholder="Ej.: saldo según planilla anterior" value={description} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <LoadingButton type="submit" loading={pending === "free"} loadingLabel="Agregando el saldo" disabled={pending !== null || !valid}>
            Agregar saldo
          </LoadingButton>
        </form>
      </CardContent>
    </Card>
  );
};

export default OpeningFreeBalance;
