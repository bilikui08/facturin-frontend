import { useState } from "react";
import { Lock } from "lucide-react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { confirmOpening } from "../../services/receivablesService";
import type { OpeningState } from "../../types/receivables";
import { formatDate, formatMoney } from "../../utils/invoiceFormat";
import LoadingButton from "../LoadingButton";
import type { OpeningActions } from "./types";

/** Cierra la apertura. Pide confirmación porque después no se puede cambiar. */
const OpeningConfirm = ({ state, pending, act }: OpeningActions & { state: OpeningState }) => {
  const [open, setOpen] = useState(false);
  const confirming = pending === "confirm";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">Cuando esté todo cargado, confirmá la apertura. Después ya no se puede modificar.</p>
      <AlertDialog open={open} onOpenChange={(next) => !confirming && setOpen(next)}>
        <AlertDialogTrigger asChild>
          <Button type="button" disabled={pending !== null}>
            <Lock />
            Confirmar apertura
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar la apertura de la cuenta corriente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se abre el {formatDate(state.opening?.opening_date)} con {state.totals.items} {state.totals.items === 1 ? "partida" : "partidas"} por{" "}
              {formatMoney(state.totals.amount)}. Una vez confirmada no se puede modificar ni deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>Seguir revisando</AlertDialogCancel>
            <LoadingButton
              type="button"
              loading={confirming}
              loadingLabel="Confirmando la apertura"
              disabled={pending !== null}
              onClick={async () => {
                if (await act("confirm", () => confirmOpening(), "La cuenta corriente quedó abierta.")) setOpen(false);
              }}
            >
              Sí, confirmar
            </LoadingButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OpeningConfirm;
