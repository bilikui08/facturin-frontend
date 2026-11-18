import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { apiRequest } from "../services/apiClient";
import type { Resource } from "../types/crud";
import type { InvoiceRow, Paginated } from "../types/invoice";
import DateInput from "./DateInput";
import FormField from "./FormField";
import InvoiceTable from "./InvoiceTable";
import LoadingBlock from "./LoadingBlock";
import StatusAlert from "./StatusAlert";

interface Filters {
  customer: string;
  sale_point_id: string;
  voucher_type_id: string;
  payment_condition_id: string;
  issue_date_from: string;
  issue_date_to: string;
  number: string;
  cae: string;
  afip_environment: string;
  total_from: string;
  total_to: string;
}

const emptyFilters = (): Filters => ({
  customer: "",
  sale_point_id: "",
  voucher_type_id: "",
  payment_condition_id: "",
  issue_date_from: "",
  issue_date_to: "",
  number: "",
  cae: "",
  // Por defecto solo se listan los comprobantes de producción (los de homologación son de prueba)
  afip_environment: "produccion",
  total_from: "",
  total_to: "",
});

const PAGE_SIZES = [10, 25, 50];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const toResources = (payload: unknown): Resource[] => {
  const list = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : [];
  return list.filter(
    (v): v is Resource =>
      isRecord(v) && (typeof v.id === "string" || typeof v.id === "number"),
  );
};

const optionLabel = (r: Resource) => String(r.name ?? r.description ?? r.label ?? r.id);

const buildQuery = (filters: Filters, page: number, perPage: number): string => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value.trim() !== "") params.set(key, value.trim());
  });
  params.set("page", String(page));
  params.set("per_page", String(perPage));
  return `?${params.toString()}`;
};

const InvoiceSearch = () => {
  const [salePoints, setSalePoints] = useState<Resource[]>([]);
  const [paymentConditions, setPaymentConditions] = useState<Resource[]>([]);
  const [voucherTypes, setVoucherTypes] = useState<Resource[]>([]);
  const [form, setForm] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  // Resultado de la última consulta, identificado por la clave de búsqueda que lo originó
  const [loaded, setLoaded] = useState<{
    key: string;
    data: Paginated<InvoiceRow> | null;
    error: string;
  } | null>(null);

  // Se incrementa cuando una acción (ej. anular) cambia los datos, para volver a consultar
  const [reloadToken, setReloadToken] = useState(0);
  const queryKey = `${buildQuery(applied, page, perPage)}#${reloadToken}`;
  const loading = loaded?.key !== queryKey;
  const result = loaded?.data ?? null;
  const error = loaded?.error ?? "";

  // Datos de los desplegables
  useEffect(() => {
    Promise.all([
      apiRequest("/sale-points"),
      apiRequest("/payment-conditions"),
      apiRequest("/voucher-types"),
    ])
      .then(([s, p, v]) => {
        setSalePoints(toResources(s));
        setPaymentConditions(toResources(p));
        setVoucherTypes(toResources(v));
      })
      .catch(() => undefined);
  }, []);

  // Se vuelve a consultar al cambiar los filtros aplicados, la página o el tamaño
  useEffect(() => {
    let current = true;
    apiRequest<Paginated<InvoiceRow>>(`/invoices${queryKey.split("#")[0]}`)
      .then((data) => {
        if (current) setLoaded({ key: queryKey, data, error: "" });
      })
      .catch((err) => {
        if (current) {
          setLoaded({
            key: queryKey,
            data: null,
            error: err instanceof Error ? err.message : "No se pudo buscar los comprobantes",
          });
        }
      });
    return () => {
      current = false;
    };
  }, [queryKey]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleDateChange = (name: string, iso: string) =>
    setForm((f) => ({ ...f, [name]: iso }));

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

  const invoices = result?.data ?? [];

  return (
    <section className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Búsqueda de comprobantes</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Cliente (nombre o documento)" htmlFor="f-customer"
                className="sm:col-span-2 lg:col-span-2">
                <Input id="f-customer" name="customer" value={form.customer}
                  onChange={handleChange} maxLength={100} />
              </FormField>
              <FormField label="Punto de venta" htmlFor="f-sp">
                <NativeSelect id="f-sp" name="sale_point_id"
                  value={form.sale_point_id} onChange={handleChange}>
                  <NativeSelectOption value="">Todos</NativeSelectOption>
                  {salePoints.map((s) => (
                    <NativeSelectOption key={s.id} value={s.id}>
                      {String(s.number ?? s.id)}{s.name ? ` - ${s.name}` : ""}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Condición de venta" htmlFor="f-pc">
                <NativeSelect id="f-pc" name="payment_condition_id"
                  value={form.payment_condition_id} onChange={handleChange}>
                  <NativeSelectOption value="">Todas</NativeSelectOption>
                  {paymentConditions.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {optionLabel(p)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>

              <FormField label="Fecha de emisión desde" htmlFor="f-from">
                <DateInput id="f-from" name="issue_date_from" value={form.issue_date_from}
                  onChange={handleDateChange} />
              </FormField>
              <FormField label="Fecha de emisión hasta" htmlFor="f-to">
                <DateInput id="f-to" name="issue_date_to" value={form.issue_date_to}
                  onChange={handleDateChange} />
              </FormField>
              <FormField label="Nº de comprobante" htmlFor="f-number">
                <Input id="f-number" name="number" type="number" min="1"
                  value={form.number} onChange={handleChange} />
              </FormField>
              <FormField label="CAE" htmlFor="f-cae">
                <Input id="f-cae" name="cae" maxLength={20}
                  value={form.cae} onChange={handleChange} />
              </FormField>

              <FormField label="Ambiente de AFIP" htmlFor="f-env">
                <NativeSelect id="f-env" name="afip_environment"
                  value={form.afip_environment} onChange={handleChange}>
                  <NativeSelectOption value="">Todos</NativeSelectOption>
                  <NativeSelectOption value="produccion">Producción</NativeSelectOption>
                  <NativeSelectOption value="homologacion">Homologación (pruebas)</NativeSelectOption>
                </NativeSelect>
              </FormField>
              <FormField label="Tipo de comprobante" htmlFor="f-vt">
                <NativeSelect id="f-vt" name="voucher_type_id"
                  value={form.voucher_type_id} onChange={handleChange}>
                  <NativeSelectOption value="">Todos</NativeSelectOption>
                  {voucherTypes.map((v) => (
                    <NativeSelectOption key={v.id} value={v.id}>
                      {String(v.description ?? v.id)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Importe desde" htmlFor="f-tfrom">
                <Input id="f-tfrom" name="total_from" type="number" min="0" step="0.01"
                  value={form.total_from} onChange={handleChange} />
              </FormField>
              <FormField label="Importe hasta" htmlFor="f-tto">
                <Input id="f-tto" name="total_to" type="number" min="0" step="0.01"
                  value={form.total_to} onChange={handleChange} />
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
          <CardTitle className="text-base">Comprobantes emitidos</CardTitle>
          <span className="text-sm text-muted-foreground">
            {result ? `${result.total} resultado${result.total === 1 ? "" : "s"}` : ""}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {loading && !result ? (
            <LoadingBlock />
          ) : invoices.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">
              No se encontraron comprobantes.
            </p>
          ) : (
            <InvoiceTable
              invoices={invoices}
              customerName={(i) => i.customer?.name ?? "—"}
              onChanged={() => setReloadToken((n) => n + 1)}
              dimmed={loading}
            />
          )}
        </CardContent>

        {result && result.total > 0 && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t py-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground" htmlFor="f-size">Por página</label>
              <NativeSelect id="f-size" size="sm" wrapperClassName="w-20" value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
                {PAGE_SIZES.map((n) => (
                  <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>
                ))}
              </NativeSelect>
              <span className="text-sm text-muted-foreground">
                {result.from}–{result.to} de {result.total}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" type="button"
                disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {result.current_page} de {result.last_page}
              </span>
              <Button variant="outline" size="sm" type="button"
                disabled={loading || page >= result.last_page}
                onClick={() => setPage((p) => p + 1)}>
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

export default InvoiceSearch;
