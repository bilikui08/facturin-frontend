import { useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getTrash, restoreTrashItems } from "../services/trashService";
import { P } from "../config/permissions";
import { useAccess } from "../hooks/useAccess";
import { trashKey, type TrashItem, type TrashType } from "../types/trash";
import { formatDateTime } from "../utils/auditFormat";
import LoadingBlock from "./LoadingBlock";
import StatusAlert from "./StatusAlert";
import { useQuery } from "./useQuery";

interface Feedback {
  restored: number;
  failed: { label: string; message: string }[];
  error: string;
}

const PAGE_SIZES = [20, 50, 100];

/** Quién eliminó el registro, tal como lo muestra la auditoría: nombre, "Vos", "Usuario N" o la consola. */
const deletedBy = (item: TrashItem): string =>
  item.deleted_by_me ? "Vos" : item.deleted_by_name ?? (item.deleted_by ? `Usuario ${item.deleted_by}` : "Consola");

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Papelera de reciclaje: lo que la persona eliminó, con la opción de restaurarlo. */
const Trash = () => {
  const { can } = useAccess();
  const seesEveryone = can(P.trashRestoreAny);
  // Cada tipo exige el permiso de administrarlo
  const canCustomers = can(P.customerManage);
  const canSalePoints = can(P.salePointManage);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [restoring, setRestoring] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [type, setType] = useState<TrashType | "">("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZES[0]);

  const { data, loading, error } = useQuery(
    (signal) => getTrash({ type: type || undefined, page, perPage }, signal),
    [reload, type, page, perPage],
    "No se pudo cargar la papelera",
  );

  const items = data?.items ?? [];
  // Lo seleccionado que sigue en la papelera (después de restaurar, la lista cambia)
  const chosen = items.filter((item) => selected.has(trashKey(item)));
  const allChosen = items.length > 0 && chosen.length === items.length;

  // Al cambiar de página o de filtro la selección deja de ser visible: se descarta para no restaurar a ciegas
  const goTo = (change: () => void) => {
    change();
    setSelected(new Set());
  };

  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(items.map(trashKey)) : new Set());

  const toggleOne = (item: TrashItem, checked: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(trashKey(item));
      else next.delete(trashKey(item));
      return next;
    });

  const restore = async (targets: TrashItem[]) => {
    const labels = new Map(targets.map((item) => [trashKey(item), `${item.type_label} ${item.label}`]));

    setRestoring(true);
    setFeedback(null);

    try {
      const result = await restoreTrashItems(targets);
      setFeedback({
        restored: result.restored.length,
        failed: result.failed.map((f) => ({ label: labels.get(trashKey(f)) ?? `#${f.id}`, message: f.message })),
        error: "",
      });
      setSelected(new Set());
      // Si se vació la página actual, se vuelve a la anterior en lugar de mostrar una página inexistente
      if (page > 1 && result.restored.length >= items.length) setPage(page - 1);
      setReload((n) => n + 1);
    } catch (err) {
      setFeedback({ restored: 0, failed: [], error: err instanceof Error ? err.message : "No se pudo restaurar" });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <section className="space-y-6">
      <p className="text-muted-foreground">
        {seesEveryone
          ? "Lo que se eliminó en la empresa queda en la papelera y podés restaurarlo desde acá cuando quieras, aunque lo haya eliminado otra persona."
          : "Lo que eliminás queda en la papelera y podés restaurarlo desde acá cuando quieras."}{" "}
        Sus datos se conservan porque los comprobantes emitidos los necesitan.
      </p>

      {error && <StatusAlert kind="error">{error}</StatusAlert>}
      {feedback?.error && <StatusAlert kind="error">{feedback.error}</StatusAlert>}
      {feedback && feedback.restored > 0 && (
        <StatusAlert kind="success">{plural(feedback.restored, "registro restaurado", "registros restaurados")}.</StatusAlert>
      )}
      {feedback?.failed.map((failure) => (
        <StatusAlert kind="error" key={failure.label + failure.message}>
          {failure.label}: {failure.message}
        </StatusAlert>
      ))}

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row items-center justify-between border-b py-4 [.border-b]:pb-4">
          <CardTitle className="text-base">{seesEveryone ? "Registros eliminados en la empresa" : "Registros eliminados por vos"}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="trash-type">Tipo</label>
            <NativeSelect
              id="trash-type"
              size="sm"
              wrapperClassName="w-44"
              value={type}
              onChange={(e) => goTo(() => { setType(e.target.value as TrashType | ""); setPage(1); })}
            >
              <NativeSelectOption value="">Todos</NativeSelectOption>
              {canCustomers && <NativeSelectOption value="customer">Clientes</NativeSelectOption>}
              {canSalePoints && <NativeSelectOption value="sale_point">Puntos de venta</NativeSelectOption>}
            </NativeSelect>
          <Button
            type="button"
            size="sm"
            disabled={chosen.length === 0 || restoring}
            onClick={() => restore(chosen)}
          >
            {restoring ? <Spinner aria-label="Restaurando" /> : <RotateCcw />}
            Restaurar seleccionados{chosen.length > 0 ? ` (${chosen.length})` : ""}
          </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading && !data ? (
            <LoadingBlock />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
              <Trash2 className="size-10 opacity-40" aria-hidden="true" />
              <p>{type ? "No hay registros de este tipo en la papelera." : "La papelera está vacía."}</p>
            </div>
          ) : (
            <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Seleccionar todos"
                        checked={allChosen ? true : chosen.length > 0 ? "indeterminate" : false}
                        onCheckedChange={(checked) => toggleAll(checked === true)}
                      />
                    </TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Entidad</TableHead>
                    {seesEveryone && <TableHead>Eliminado por</TableHead>}
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={trashKey(item)} data-state={selected.has(trashKey(item)) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Seleccionar ${item.type_label} ${item.label}`}
                          checked={selected.has(trashKey(item))}
                          onCheckedChange={(checked) => toggleOne(item, checked === true)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(item.deleted_at)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{item.type_label}</Badge>
                          <span className="font-medium">{item.label}</span>
                          <span className="text-xs text-muted-foreground">#{item.id}</span>
                        </div>
                      </TableCell>
                      {seesEveryone && (
                        <TableCell className="whitespace-nowrap text-muted-foreground">{deletedBy(item)}</TableCell>
                      )}
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          disabled={restoring}
                          aria-label={`Restaurar ${item.type_label} ${item.label}`}
                          onClick={() => restore([item])}
                        >
                          <RotateCcw />
                          Restaurar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

        {data && data.total > 0 && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t py-3 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="trash-size">Por página</label>
              <NativeSelect
                id="trash-size"
                size="sm"
                wrapperClassName="w-20"
                value={perPage}
                onChange={(e) => goTo(() => { setPerPage(Number(e.target.value)); setPage(1); })}
              >
                {PAGE_SIZES.map((n) => (
                  <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>
                ))}
              </NativeSelect>
              <span>
                {plural(data.total, "registro", "registros")} en la papelera
                {chosen.length > 0 ? ` · ${plural(chosen.length, "seleccionado", "seleccionados")}` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" type="button" disabled={loading || page <= 1} onClick={() => goTo(() => setPage((p) => p - 1))}>
                <ChevronLeft />
                Anterior
              </Button>
              <span>
                Página {data.page} de {data.last_page}
              </span>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={loading || page >= data.last_page}
                onClick={() => goTo(() => setPage((p) => p + 1))}
              >
                Siguiente
                <ChevronRight />
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>
    </section>
  );
};

export default Trash;
