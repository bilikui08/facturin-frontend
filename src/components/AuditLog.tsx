import { useState, type ChangeEvent, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Eye, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest } from "../services/apiClient";
import type { AuditLogRow } from "../types/audit";
import type { Paginated } from "../types/invoice";
import {
  AUDIT_ACTIONS,
  AUDIT_TYPES,
  auditActionLabel,
  auditActionTone,
  auditDetailRows,
  auditRecordLabel,
  auditUserLabel,
  formatDateTime,
} from "../utils/auditFormat";
import DateInput from "./DateInput";
import FormField from "./FormField";
import LoadingBlock from "./LoadingBlock";
import StatusAlert from "./StatusAlert";
import { useQuery } from "./useQuery";

interface Filters {
  auditable_type: string;
  action: string;
  user_id: string;
  date_from: string;
  date_to: string;
}

const emptyFilters = (): Filters => ({ auditable_type: "", action: "", user_id: "", date_from: "", date_to: "" });

const PAGE_SIZES = [25, 50, 100];

const buildQuery = (filters: Filters, page: number, perPage: number): string => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value.trim() !== "") params.set(key, value.trim());
  });
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  return `?${params.toString()}`;
};

/** Quién hizo qué y cuándo sobre los datos del usuario (solo lectura). */
const AuditLog = () => {
  const [form, setForm] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [selected, setSelected] = useState<AuditLogRow | null>(null);

  const { data: result, loading, error } = useQuery<Paginated<AuditLogRow>>(
    (signal) => apiRequest(`/audit-logs${buildQuery(applied, page, perPage)}`, { signal }),
    [applied, page, perPage],
    "No se pudo consultar la auditoría",
  );

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPage(1);
    setApplied(form);
  };

  const handleClear = () => {
    setForm(emptyFilters());
    setPage(1);
    setApplied(emptyFilters());
  };

  const rows = result?.data ?? [];
  const detail = selected ? auditDetailRows(selected.changes) : [];
  const isEdit = detail.some((row) => row.old !== undefined);

  return (
    <section className="space-y-6">
      <p className="text-muted-foreground">
        Registro de quién hizo qué sobre tus clientes, puntos de venta, perfil fiscal y comprobantes. Es de solo lectura.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <FormField label="Registro" htmlFor="a-type">
                <NativeSelect id="a-type" name="auditable_type" value={form.auditable_type} onChange={handleChange}>
                  <NativeSelectOption value="">Todos</NativeSelectOption>
                  {Object.entries(AUDIT_TYPES).map(([value, text]) => (
                    <NativeSelectOption key={value} value={value}>{text}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Acción" htmlFor="a-action">
                <NativeSelect id="a-action" name="action" value={form.action} onChange={handleChange}>
                  <NativeSelectOption value="">Todas</NativeSelectOption>
                  {Object.entries(AUDIT_ACTIONS).map(([value, { label }]) => (
                    <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Usuario (id)" htmlFor="a-user">
                <Input id="a-user" name="user_id" type="number" min="1" value={form.user_id} onChange={handleChange} />
              </FormField>
              <FormField label="Desde" htmlFor="a-from">
                <DateInput
                  id="a-from"
                  name="date_from"
                  value={form.date_from}
                  onChange={(name, iso) => setForm((f) => ({ ...f, [name]: iso }))}
                />
              </FormField>
              <FormField label="Hasta" htmlFor="a-to">
                <DateInput
                  id="a-to"
                  name="date_to"
                  value={form.date_to}
                  onChange={(name, iso) => setForm((f) => ({ ...f, [name]: iso }))}
                />
              </FormField>
            </div>
          </CardContent>
          <CardFooter className="mt-6 flex gap-2 border-t pt-6">
            <Button type="submit" disabled={loading}>
              <Search />
              Buscar
            </Button>
            <Button variant="outline" type="button" onClick={handleClear}>
              <X />
              Limpiar
            </Button>
          </CardFooter>
        </form>
      </Card>

      {error && <StatusAlert kind="error">{error}</StatusAlert>}

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row items-center justify-between border-b py-4 [.border-b]:pb-4">
          <CardTitle className="text-base">Actividad</CardTitle>
          <span className="text-sm text-muted-foreground">
            {result ? `${result.total} registro${result.total === 1 ? "" : "s"}` : ""}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {loading && !result ? (
            <LoadingBlock />
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No hay actividad registrada con esos filtros.</p>
          ) : (
            <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Fecha y hora</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>Registro</TableHead>
                    <TableHead className="text-right">Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(row.created_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{auditUserLabel(row.user_id)}</TableCell>
                      <TableCell>
                        <Badge variant={auditActionTone(row.action)}>{auditActionLabel(row.action)}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{auditRecordLabel(row)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" type="button" onClick={() => setSelected(row)}>
                          <Eye />
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

        {result && result.total > 0 && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t py-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground" htmlFor="a-size">Por página</label>
              <NativeSelect
                id="a-size"
                size="sm"
                wrapperClassName="w-20"
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZES.map((n) => (
                  <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>
                ))}
              </NativeSelect>
              <span className="text-sm text-muted-foreground">
                {result.from}–{result.to} de {result.total}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" type="button" disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {result.current_page} de {result.last_page}
              </span>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={loading || page >= result.last_page}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
                <ChevronRight />
              </Button>
            </div>
          </CardFooter>
        )}
      </Card>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{auditActionLabel(selected.action)}</DialogTitle>
                <DialogDescription>
                  {auditRecordLabel(selected)} · {formatDateTime(selected.created_at)} · {auditUserLabel(selected.user_id)}
                </DialogDescription>
              </DialogHeader>

              {detail.length === 0 ? (
                <p className="text-sm text-muted-foreground">Esta acción no tiene datos adicionales.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campo</TableHead>
                      {isEdit ? (
                        <>
                          <TableHead>Antes</TableHead>
                          <TableHead>Después</TableHead>
                        </>
                      ) : (
                        <TableHead>Valor</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.map((row) => (
                      <TableRow key={row.field}>
                        <TableCell className="font-medium">{row.field}</TableCell>
                        {isEdit ? (
                          <>
                            <TableCell className="text-muted-foreground">{row.old}</TableCell>
                            <TableCell>{row.new}</TableCell>
                          </>
                        ) : (
                          <TableCell>{row.value}</TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {(selected.ip_address || selected.user_agent) && (
                <p className="break-all text-xs text-muted-foreground">
                  Origen: {selected.ip_address ?? "—"} · {selected.user_agent ?? "—"}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default AuditLog;
