import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { P } from "../../config/permissions";
import { useAction } from "../../hooks/useAction";
import { useAccess } from "../../hooks/useAccess";
import { ApiError } from "../../services/apiClient";
import { getOpening, updateOpeningDate } from "../../services/receivablesService";
import type { OpeningState } from "../../types/receivables";
import { formatDate } from "../../utils/invoiceFormat";
import DateInput from "../DateInput";
import FormField from "../FormField";
import LoadingBlock from "../LoadingBlock";
import LoadingButton from "../LoadingButton";
import StatusAlert from "../StatusAlert";
import { useQuery } from "../useQuery";
import OpeningCandidates from "./OpeningCandidates";
import OpeningConfirm from "./OpeningConfirm";
import OpeningFreeBalance from "./OpeningFreeBalance";
import OpeningItemsTable from "./OpeningItemsTable";
import OpeningStart from "./OpeningStart";
import OpeningWarnings from "./OpeningWarnings";
import type { OpeningActions } from "./types";

/** Códigos del servidor que significan "otra persona ya cambió el estado": se vuelve a cargar para mostrar lo que hay. */
const STALE_STATE_CODES = new Set(["RECEIVABLES_OPENING_EXISTS", "RECEIVABLES_OPENING_CONFIRMED", "RECEIVABLES_OPENING_MISSING"]);

const DateEditor = ({ state, pending, act }: OpeningActions & { state: OpeningState }) => {
  const saved = state.opening?.opening_date ?? "";
  const [date, setDate] = useState(saved);
  const changed = date !== saved;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FormField label="Fecha de apertura" htmlFor="opening-date-edit" className="w-64">
        <DateInput id="opening-date-edit" name="opening_date" value={date} onChange={(_, iso) => setDate(iso)} />
      </FormField>
      {changed && (
        <LoadingButton
          type="button"
          variant="outline"
          loading={pending === "date"}
          loadingLabel="Guardando la fecha"
          disabled={pending !== null || date === ""}
          onClick={() => act("date", () => updateOpeningDate(date))}
        >
          Guardar fecha
        </LoadingButton>
      )}
    </div>
  );
};

/**
 * Apertura de la cuenta corriente: empieza como un borrador (fecha, comprobantes anteriores que se deben, saldos sin comprobante) y se
 * cierra al confirmarla. Cada botón que escribe queda deshabilitado con un spinner desde el primer click (`useAction`).
 */
const ReceivablesOpening = ({ onChanged }: { onChanged?: () => void }) => {
  const { can } = useAccess();
  const canManage = can(P.paymentManage);
  const { pending, run } = useAction();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const { data: state, loading, error: loadError } = useQuery((signal) => getOpening(signal), [version], "No se pudo cargar la apertura");

  const act = async (key: string, action: () => Promise<unknown>, success?: string): Promise<boolean> => {
    setError("");
    setNotice("");

    const done = await run(key, async () => {
      try {
        await action();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo completar la acción");
        if (err instanceof ApiError && err.code && STALE_STATE_CODES.has(err.code)) setVersion((n) => n + 1);
        return false;
      }
    });

    if (done) {
      if (success) setNotice(success);
      setVersion((n) => n + 1);
      onChanged?.();
    }

    return done === true;
  };

  if (loading && !state) return <LoadingBlock />;

  const opening = state?.opening ?? null;
  const isDraft = opening?.status === "draft";
  const actions = { pending, act };
  // Cambia cuando llega un estado con partidas distintas: recién ahí se vuelve a pedir la lista de comprobantes anteriores
  const itemsKey = (state?.items ?? []).map((i) => `${i.id}:${i.voided_at ? 1 : 0}`).join(",");

  return (
    <section className="space-y-6">
      <p className="text-muted-foreground">
        La cuenta corriente lleva lo que cada cliente debe: facturas, cobros y anticipos. Se empieza declarando desde cuándo y cuánto se debía a esa fecha.
      </p>

      {loadError && <StatusAlert kind="error">{loadError}</StatusAlert>}
      {error && <StatusAlert kind="error">{error}</StatusAlert>}
      {notice && <StatusAlert kind="success">{notice}</StatusAlert>}

      {state && opening === null && <OpeningStart canManage={canManage} {...actions} />}

      {state && opening && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-end justify-between gap-4">
              {isDraft && canManage ? (
                <DateEditor key={opening.opening_date} state={state} pending={pending} act={act} />
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">Fecha de apertura</p>
                  <p className="text-lg font-semibold tabular-nums">{formatDate(opening.opening_date)}</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>{opening.historical_invoices} {opening.historical_invoices === 1 ? "comprobante anterior" : "comprobantes anteriores"}</span>
                {isDraft ? <Badge variant="secondary">Borrador</Badge> : <Badge><CircleCheck />Confirmada el {formatDate(opening.confirmed_at)}</Badge>}
              </div>
            </CardContent>
          </Card>

          <OpeningWarnings version={version} />

          {isDraft && canManage && (
            <>
              <OpeningCandidates itemsKey={itemsKey} {...actions} />
              <OpeningFreeBalance {...actions} />
            </>
          )}

          <OpeningItemsTable state={state} canEdit={isDraft && canManage} {...actions} />

          {isDraft && canManage && <OpeningConfirm state={state} {...actions} />}
          {isDraft && !canManage && <StatusAlert kind="success">La apertura está en borrador. Una persona con permiso para registrar cobros tiene que completarla y confirmarla.</StatusAlert>}
          {!isDraft && <StatusAlert kind="success">La cuenta corriente está abierta. Los cobros y el estado de cuenta de cada cliente se suman a esta pantalla en las próximas versiones.</StatusAlert>}
        </>
      )}
    </section>
  );
};

export default ReceivablesOpening;
