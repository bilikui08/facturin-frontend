import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { apiRequest } from "../services/apiClient";
import InvoiceTable from "./InvoiceTable";
import type { InvoiceRow } from "../types/invoice";
import { settingValue, type SettingDefinition } from "../types/settings";
import { formatMoney } from "../utils/invoiceFormat";
import DateInput from "./DateInput";
import FormField from "./FormField";
import LoadingBlock from "./LoadingBlock";
import StatusAlert from "./StatusAlert";
import { exceedsMaxAmount, invoiceTotal, limitDecimals, round2 } from "../utils/amounts";
import type { Resource } from "../types/crud";

interface ItemForm {
  code: string;
  description: string;
  quantity: string;
  unit: string;
  price: string;
}

interface HeaderForm {
  customer_id: string;
  sale_point_id: string;
  payment_condition_id: string;
  /** Período del servicio facturado (yyyy-mm-dd) */
  service_from: string;
  service_to: string;
  /** Vencimiento de pago (yyyy-mm-dd) */
  payment_due_date: string;
  /** Opcional: si queda vacío, el backend usa la fecha de hoy */
  issue_date: string;
}

/**
 * Cantidad de comprobantes recientes debajo del formulario: la define la Configuración (5 a 50; 10 por defecto).
 * Se piden siempre los 50 más nuevos y se muestran los que indique el parámetro.
 */
const RECENT_SETTING = "recent_invoices_count";
const RECENT_DEFAULT = 10;
const RECENT_MAX = 50;
const RECENT_INVOICES_PATH = `/invoices?per_page=${RECENT_MAX}`;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const isResource = (v: unknown): v is Resource =>
  isRecord(v) && (typeof v.id === "string" || typeof v.id === "number");

const normalize = (payload: unknown): Resource[] => {
  if (Array.isArray(payload)) return payload.filter(isResource);
  if (isRecord(payload) && Array.isArray(payload.data)) {
    return payload.data.filter(isResource);
  }
  return [];
};

const emptyItem = (): ItemForm => ({
  code: "",
  description: "",
  quantity: "1",
  unit: "",
  price: "",
});

const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Por defecto: el período es el mes anterior (caso típico de honorarios mensuales)
// y el vencimiento de pago es hoy. Se pueden cambiar en el formulario.
const emptyHeader = (): HeaderForm => {
  const now = new Date();
  return {
    customer_id: "",
    sale_point_id: "",
    payment_condition_id: "",
    service_from: toIso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    service_to: toIso(new Date(now.getFullYear(), now.getMonth(), 0)),
    payment_due_date: toIso(now),
    issue_date: "",
  };
};

const optionLabel = (r: Resource) =>
  String(r.name ?? r.description ?? r.label ?? r.code ?? r.id);

const Invoices = () => {
  const [customers, setCustomers] = useState<Resource[]>([]);
  const [salePoints, setSalePoints] = useState<Resource[]>([]);
  const [paymentConditions, setPaymentConditions] = useState<Resource[]>([]);
  const [invoices, setInvoices] = useState<Resource[]>([]);
  const [recentCount, setRecentCount] = useState(RECENT_DEFAULT);
  const [header, setHeader] = useState<HeaderForm>(emptyHeader);
  const [items, setItems] = useState<ItemForm[]>([emptyItem()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadInvoices = async () => {
    try {
      setInvoices(normalize(await apiRequest(RECENT_INVOICES_PATH)));
    } catch {
      setInvoices([]);
    }
  };

  useEffect(() => {
    let current = true;
    Promise.all([
      apiRequest("/customers"),
      apiRequest("/sale-points"),
      apiRequest("/payment-conditions"),
      apiRequest(RECENT_INVOICES_PATH).catch(() => []),
      apiRequest<SettingDefinition[]>("/settings").catch(() => []),
    ])
      .then(([c, s, p, i, cfg]) => {
        if (!current) return;
        setCustomers(normalize(c));
        setSalePoints(normalize(s));
        setPaymentConditions(normalize(p));
        setInvoices(normalize(i));
        setRecentCount(settingValue(cfg, RECENT_SETTING, RECENT_DEFAULT));
      })
      .catch((err) => {
        if (current) {
          setError(err instanceof Error ? err.message : "No se pudieron cargar los datos");
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  const handleHeaderChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setHeader((h) => ({ ...h, [name]: value }));
  };

  const handleDateChange = (name: string, iso: string) =>
    setHeader((h) => ({ ...h, [name]: iso }));

  const updateItem = (index: number, field: keyof ItemForm, value: string) =>
    setItems((list) =>
      list.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );

  const addItem = () => setItems((list) => [...list, emptyItem()]);

  const removeItem = (index: number) =>
    setItems((list) => (list.length > 1 ? list.filter((_, i) => i !== index) : list));

  // Mismo cálculo que el backend: cada línea a 2 decimales y el total como suma de líneas
  const total = invoiceTotal(items);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    if (header.service_to < header.service_from) {
      setError("El período facturado hasta no puede ser anterior al período desde.");
      setSaving(false);
      return;
    }
    if (exceedsMaxAmount(total)) {
      setError("El total supera el máximo que admite ARCA (13 dígitos enteros).");
      setSaving(false);
      return;
    }
    if (header.issue_date && header.payment_due_date < header.issue_date) {
      setError("El vencimiento de pago no puede ser anterior a la fecha de emisión.");
      setSaving(false);
      return;
    }

    const payload = {
      customer_id: Number(header.customer_id),
      sale_point_id: Number(header.sale_point_id),
      payment_condition_id: Number(header.payment_condition_id),
      concept: 2, // Servicios
      service_from: header.service_from,
      service_to: header.service_to,
      payment_due_date: header.payment_due_date,
      ...(header.issue_date ? { issue_date: header.issue_date } : {}),
      items: items.map((item) => ({
        code: item.code || null,
        description: item.description,
        quantity: round2(Number(item.quantity)),
        unit: item.unit || null,
        price: round2(Number(item.price)),
      })),
    };

    try {
      await apiRequest("/invoices", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSuccess("Comprobante emitido correctamente.");
      setHeader(emptyHeader());
      setItems([emptyItem()]);
      await loadInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo emitir el comprobante");
    } finally {
      setSaving(false);
    }
  };

  const label = (list: Resource[], id: unknown) => {
    const r = list.find((x) => String(x.id) === String(id));
    return String(r?.name ?? r?.number ?? id ?? "—");
  };

  if (loading) {
    return <LoadingBlock />;
  }

  const emptyOption = <NativeSelectOption value="">Seleccionar...</NativeSelectOption>;

  return (
    <section className="space-y-6">
      {error && <StatusAlert kind="error">{error}</StatusAlert>}
      {success && <StatusAlert kind="success">{success}</StatusAlert>}

      <Card>
        <CardHeader>
          <CardTitle>Nuevo comprobante</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <FormField label="Cliente" htmlFor="inv-customer">
                <NativeSelect id="inv-customer" name="customer_id"
                  value={header.customer_id} onChange={handleHeaderChange} required>
                  {emptyOption}
                  {customers.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>
                      {String(c.name ?? c.id)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Punto de venta" htmlFor="inv-sp">
                <NativeSelect id="inv-sp" name="sale_point_id"
                  value={header.sale_point_id} onChange={handleHeaderChange} required>
                  {emptyOption}
                  {salePoints.map((s) => (
                    <NativeSelectOption key={s.id} value={s.id}>
                      {String(s.number ?? s.id)}{s.name ? ` - ${s.name}` : ""}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Condición de venta" htmlFor="inv-pc">
                <NativeSelect id="inv-pc" name="payment_condition_id"
                  value={header.payment_condition_id} onChange={handleHeaderChange} required>
                  {emptyOption}
                  {paymentConditions.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {optionLabel(p)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Período facturado desde" htmlFor="inv-from">
                <DateInput id="inv-from" name="service_from" value={header.service_from}
                  onChange={handleDateChange} required />
              </FormField>
              <FormField label="Período facturado hasta" htmlFor="inv-to">
                <DateInput id="inv-to" name="service_to" value={header.service_to}
                  onChange={handleDateChange} required />
              </FormField>
              <FormField label="Fecha de Vto. para el pago" htmlFor="inv-due">
                <DateInput id="inv-due" name="payment_due_date" value={header.payment_due_date}
                  onChange={handleDateChange} required />
              </FormField>
              <FormField label="Fecha de emisión" htmlFor="inv-issue"
                hint="Opcional. Si la dejás vacía, es hoy.">
                <DateInput id="inv-issue" name="issue_date" value={header.issue_date}
                  onChange={handleDateChange} />
              </FormField>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Ítems</h3>
              {items.map((item, index) => (
                <div className="grid grid-cols-12 gap-3 border-b pb-4 last:border-b-0 last:pb-0"
                  key={index}>
                  <FormField label="Código" htmlFor={`inv-item-${index}-code`}
                    className="col-span-6 md:col-span-2">
                    <Input id={`inv-item-${index}-code`} maxLength={50} value={item.code}
                      onChange={(e) => updateItem(index, "code", e.target.value)} />
                  </FormField>
                  <FormField label="Descripción" htmlFor={`inv-item-${index}-description`}
                    className="col-span-12 md:col-span-3">
                    <Input id={`inv-item-${index}-description`} maxLength={255}
                      value={item.description} required
                      onChange={(e) => updateItem(index, "description", e.target.value)} />
                  </FormField>
                  <FormField label="Cant." htmlFor={`inv-item-${index}-quantity`}
                    className="col-span-4 md:col-span-2">
                    <Input id={`inv-item-${index}-quantity`} type="number" min="1" step="0.01" required
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", limitDecimals(e.target.value))} />
                  </FormField>
                  <FormField label="Unidad" htmlFor={`inv-item-${index}-unit`}
                    className="col-span-4 md:col-span-2">
                    <Input id={`inv-item-${index}-unit`} maxLength={30} value={item.unit}
                      placeholder="unidades"
                      onChange={(e) => updateItem(index, "unit", e.target.value)} />
                  </FormField>
                  <FormField label="Precio" htmlFor={`inv-item-${index}-price`}
                    className="col-span-4 md:col-span-2">
                    <Input id={`inv-item-${index}-price`} type="number" min="0" step="0.01" required
                      value={item.price}
                      onChange={(e) => updateItem(index, "price", limitDecimals(e.target.value))} />
                  </FormField>
                  <div className="col-span-12 flex items-end justify-end md:col-span-1">
                    <Button variant="outline" size="icon" type="button"
                      className="text-destructive hover:text-destructive"
                      aria-label="Quitar ítem" title="Quitar ítem"
                      disabled={items.length === 1} onClick={() => removeItem(index)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" type="button" onClick={addItem}>
                <Plus />
                Agregar ítem
              </Button>
            </div>
          </CardContent>
          <CardFooter className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-6">
            <div className="flex items-baseline gap-2">
              <span className="text-sm text-muted-foreground">Total</span>
              <strong className="text-xl tabular-nums">{formatMoney(total)}</strong>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Emitiendo..." : "Emitir comprobante"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-row items-center justify-between border-b py-4 [.border-b]:pb-4">
          <CardTitle className="text-base">
            Últimos {recentCount} comprobantes emitidos
          </CardTitle>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard/invoices-list">Ver todos / buscar</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">No hay comprobantes.</p>
          ) : (
            <InvoiceTable
              invoices={invoices.slice(0, recentCount) as unknown as InvoiceRow[]}
              customerName={(i) => label(customers, i.customer_id)}
              onChanged={loadInvoices}
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
};

export default Invoices;
