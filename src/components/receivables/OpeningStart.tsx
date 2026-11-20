import { useState } from "react";
import { Landmark } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startOpening } from "../../services/receivablesService";
import { todayInArgentina } from "../../utils/dates";
import DateInput from "../DateInput";
import FormField from "../FormField";
import LoadingButton from "../LoadingButton";
import type { OpeningActions } from "./types";

interface OpeningStartProps extends OpeningActions {
  canManage: boolean;
}

/** La empresa todavía no abrió su cuenta corriente: se elige desde qué fecha. */
const OpeningStart = ({ canManage, pending, act }: OpeningStartProps) => {
  const [date, setDate] = useState(todayInArgentina);

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="size-4" aria-hidden="true" />
            La cuenta corriente todavía no está abierta
          </CardTitle>
          <CardDescription>Una persona con permiso para registrar cobros tiene que iniciar la apertura.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="size-4" aria-hidden="true" />
          Abrir la cuenta corriente
        </CardTitle>
        <CardDescription>
          Antes de registrar cobros hay que declarar desde cuándo se lleva la cuenta de cada cliente y cuánto debía a esa fecha. Primero se
          arma un borrador y recién al confirmarlo queda cerrado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          label="Fecha de apertura"
          htmlFor="opening-date"
          hint="No puede ser futura. Los comprobantes que ya existen quedan como historia anterior, sea cual sea su fecha."
          className="max-w-xs"
        >
          <DateInput id="opening-date" name="opening_date" value={date} onChange={(_, iso) => setDate(iso)} required />
        </FormField>
        <LoadingButton
          type="button"
          loading={pending === "start"}
          loadingLabel="Iniciando la apertura"
          disabled={pending !== null || date === ""}
          onClick={() => act("start", () => startOpening(date))}
        >
          Iniciar apertura
        </LoadingButton>
      </CardContent>
    </Card>
  );
};

export default OpeningStart;
