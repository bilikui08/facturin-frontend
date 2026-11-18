import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router";
import { apiRequest } from "../services/apiClient";
import InvoiceActions from "./InvoiceActions";
import AfipEnvironmentBadge from "./AfipEnvironmentBadge";
import InvoiceNumberCell from "./InvoiceNumberCell";
import { formatDate, isCreditNote } from "../utils/invoiceFormat";
import type { InvoiceRow } from "../types/invoice";
import DateInput from "./DateInput";
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

const money = (value: number) =>
  value.toLocaleString("es-AR", { style: "currency", currency: "ARS" });

const optionLabel = (r: Resource) =>
  String(r.name ?? r.description ?? r.label ?? r.code ?? r.id);

const Invoices = () => {
  const [customers, setCustomers] = useState<Resource[]>([]);
  const [salePoints, setSalePoints] = useState<Resource[]>([]);
  const [paymentConditions, setPaymentConditions] = useState<Resource[]>([]);
  const [invoices, setInvoices] = useState<Resource[]>([]);
  const [header, setHeader] = useState<HeaderForm>(emptyHeader);
  const [items, setItems] = useState<ItemForm[]>([emptyItem()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadInvoices = async () => {
    try {
      setInvoices(normalize(await apiRequest("/invoices?per_page=10")));
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
      apiRequest("/invoices?per_page=10").catch(() => []),
    ])
      .then(([c, s, p, i]) => {
        if (!current) return;
        setCustomers(normalize(c));
        setSalePoints(normalize(s));
        setPaymentConditions(normalize(p));
        setInvoices(normalize(i));
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
    return (
      <div className="p-5 text-center">
        <div className="spinner-border text-primary" role="status" />
      </div>
    );
  }

  return (
    <section>
      {error && <div className="alert alert-danger">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card card-primary card-outline mb-4">
        <div className="card-header">
          <h3 className="card-title">Nuevo comprobante</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="card-body">
            <div className="row g-3 mb-4">
              <div className="col-12 col-md-4">
                <label className="form-label" htmlFor="inv-customer">Cliente</label>
                <select id="inv-customer" className="form-select" name="customer_id"
                  value={header.customer_id} onChange={handleHeaderChange} required>
                  <option value="">Seleccionar...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{String(c.name ?? c.id)}</option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label" htmlFor="inv-sp">Punto de venta</label>
                <select id="inv-sp" className="form-select" name="sale_point_id"
                  value={header.sale_point_id} onChange={handleHeaderChange} required>
                  <option value="">Seleccionar...</option>
                  {salePoints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {String(s.number ?? s.id)}{s.name ? ` - ${s.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label" htmlFor="inv-pc">Condición de venta</label>
                <select id="inv-pc" className="form-select" name="payment_condition_id"
                  value={header.payment_condition_id} onChange={handleHeaderChange} required>
                  <option value="">Seleccionar...</option>
                  {paymentConditions.map((p) => (
                    <option key={p.id} value={p.id}>{optionLabel(p)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="row g-3 mb-4">
              <div className="col-12 col-md-3">
                <label className="form-label" htmlFor="inv-from">Período facturado desde</label>
                <DateInput id="inv-from" name="service_from" value={header.service_from}
                  onChange={handleDateChange} required />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label" htmlFor="inv-to">Período facturado hasta</label>
                <DateInput id="inv-to" name="service_to" value={header.service_to}
                  onChange={handleDateChange} required />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label" htmlFor="inv-due">Fecha de Vto. para el pago</label>
                <DateInput id="inv-due" name="payment_due_date" value={header.payment_due_date}
                  onChange={handleDateChange} required />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label" htmlFor="inv-issue">Fecha de emisión</label>
                <DateInput id="inv-issue" name="issue_date" value={header.issue_date}
                  onChange={handleDateChange} />
                <div className="form-text">Opcional. Si la dejás vacía, es hoy.</div>
              </div>
            </div>

            <h4 className="h6 mb-2">Ítems</h4>
            {items.map((item, index) => (
              <div className="row g-2 align-items-end mb-3 pb-3 border-bottom" key={index}>
                <div className="col-6 col-md-2">
                  <label className="form-label small">Código</label>
                  <input className="form-control" maxLength={50} value={item.code}
                    onChange={(e) => updateItem(index, "code", e.target.value)} />
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label small">Descripción</label>
                  <input className="form-control" maxLength={255} value={item.description} required
                    onChange={(e) => updateItem(index, "description", e.target.value)} />
                </div>
                <div className="col-4 col-md-1">
                  <label className="form-label small">Cant.</label>
                  <input className="form-control" type="number" min="1" step="0.01" required
                    value={item.quantity}
                    onChange={(e) => updateItem(index, "quantity", limitDecimals(e.target.value))} />
                </div>
                <div className="col-4 col-md-1">
                  <label className="form-label small">Unidad</label>
                  <input className="form-control" maxLength={30} value={item.unit} placeholder="unidades"
                    onChange={(e) => updateItem(index, "unit", e.target.value)} />
                </div>
                <div className="col-4 col-md-2">
                  <label className="form-label small">Precio</label>
                  <input className="form-control" type="number" min="0" step="0.01" required
                    value={item.price}
                    onChange={(e) => updateItem(index, "price", limitDecimals(e.target.value))} />
                </div>
                <div className="col-12 col-md-2 text-md-end">
                  <button className="btn btn-outline-danger btn-sm" type="button"
                    disabled={items.length === 1} onClick={() => removeItem(index)}>
                    Quitar
                  </button>
                </div>
              </div>
            ))}
            <button className="btn btn-outline-primary btn-sm" type="button" onClick={addItem}>
              + Agregar ítem
            </button>
          </div>
          <div className="card-footer d-flex justify-content-between align-items-center">
            <strong>Total: {money(total)}</strong>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "Emitiendo..." : "Emitir comprobante"}
            </button>
          </div>
        </form>
      </div>

      <div className="card card-primary card-outline">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h3 className="card-title">Últimos comprobantes emitidos</h3>
          <Link className="btn btn-outline-primary btn-sm ms-auto" to="/dashboard/invoices-list">
            Ver todos / buscar
          </Link>
        </div>
        <div className="card-body p-0">
          {invoices.length === 0 ? (
            <p className="p-4 text-center text-secondary mb-0">No hay comprobantes.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Fecha</th><th>Comprobante</th><th>Ambiente</th><th>Cliente</th>
                    <th className="text-end">Total</th><th>CAE</th>
                    <th>F. Vto. CAE</th><th className="text-end">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((row) => {
                    const i = row as unknown as InvoiceRow;
                    return (
                      <tr key={i.id}>
                        <td>{formatDate(i.issue_date ?? i.created_at)}</td>
                        <td><InvoiceNumberCell invoice={i} /></td>
                        <td><AfipEnvironmentBadge environment={i.afip_environment} /></td>
                        <td>{label(customers, i.customer_id)}</td>
                        <td className={`text-end ${isCreditNote(i) ? "text-danger" : ""}`}>
                          {i.total == null ? "—" : isCreditNote(i) ? `−${Number(i.total).toFixed(2)}` : String(i.total)}
                        </td>
                        <td>{String(i.cae ?? "—")}</td>
                        <td>{formatDate(i.cae_expiration)}</td>
                        <td className="text-end">
                          <InvoiceActions invoice={i} onChanged={loadInvoices} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Invoices;
