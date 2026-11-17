import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { apiRequest } from "../services/apiClient";
import type { Resource } from "../types/crud";
import type { InvoiceRow, Paginated } from "../types/invoice";
import AfipEnvironmentBadge from "./AfipEnvironmentBadge";
import InvoiceNumberCell from "./InvoiceNumberCell";
import { formatDate, isCreditNote } from "../utils/invoiceFormat";
import DateInput from "./DateInput";
import InvoiceActions from "./InvoiceActions";

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
    <section>
      <div className="card card-primary card-outline mb-4">
        <div className="card-header">
          <h3 className="card-title">Búsqueda de comprobantes</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-12 col-md-4">
                <label className="form-label" htmlFor="f-customer">Cliente (nombre o documento)</label>
                <input id="f-customer" className="form-control" name="customer"
                  value={form.customer} onChange={handleChange} maxLength={100} />
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label" htmlFor="f-sp">Punto de venta</label>
                <select id="f-sp" className="form-select" name="sale_point_id"
                  value={form.sale_point_id} onChange={handleChange}>
                  <option value="">Todos</option>
                  {salePoints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {String(s.number ?? s.id)}{s.name ? ` - ${s.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label" htmlFor="f-pc">Condición de venta</label>
                <select id="f-pc" className="form-select" name="payment_condition_id"
                  value={form.payment_condition_id} onChange={handleChange}>
                  <option value="">Todas</option>
                  {paymentConditions.map((p) => (
                    <option key={p.id} value={p.id}>{optionLabel(p)}</option>
                  ))}
                </select>
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label" htmlFor="f-from">Fecha de emisión desde</label>
                <DateInput id="f-from" name="issue_date_from" value={form.issue_date_from}
                  onChange={handleDateChange} />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label" htmlFor="f-to">Fecha de emisión hasta</label>
                <DateInput id="f-to" name="issue_date_to" value={form.issue_date_to}
                  onChange={handleDateChange} />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label" htmlFor="f-number">Nº de comprobante</label>
                <input id="f-number" className="form-control" name="number" type="number" min="1"
                  value={form.number} onChange={handleChange} />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label" htmlFor="f-cae">CAE</label>
                <input id="f-cae" className="form-control" name="cae" maxLength={20}
                  value={form.cae} onChange={handleChange} />
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label" htmlFor="f-env">Ambiente de AFIP</label>
                <select id="f-env" className="form-select" name="afip_environment"
                  value={form.afip_environment} onChange={handleChange}>
                  <option value="">Todos</option>
                  <option value="produccion">Producción</option>
                  <option value="homologacion">Homologación (pruebas)</option>
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label" htmlFor="f-vt">Tipo de comprobante</label>
                <select id="f-vt" className="form-select" name="voucher_type_id"
                  value={form.voucher_type_id} onChange={handleChange}>
                  <option value="">Todos</option>
                  {voucherTypes.map((v) => (
                    <option key={v.id} value={v.id}>{String(v.description ?? v.id)}</option>
                  ))}
                </select>
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label" htmlFor="f-tfrom">Importe desde</label>
                <input id="f-tfrom" className="form-control" name="total_from" type="number"
                  min="0" step="0.01" value={form.total_from} onChange={handleChange} />
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label" htmlFor="f-tto">Importe hasta</label>
                <input id="f-tto" className="form-control" name="total_to" type="number"
                  min="0" step="0.01" value={form.total_to} onChange={handleChange} />
              </div>
            </div>
          </div>
          <div className="card-footer d-flex gap-2">
            <button className="btn btn-primary" type="submit" disabled={loading}>Buscar</button>
            <button className="btn btn-outline-secondary" type="button" onClick={handleClear}>
              Limpiar
            </button>
          </div>
        </form>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card card-primary card-outline">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h3 className="card-title">Comprobantes emitidos</h3>
          <span className="ms-auto text-secondary small">
            {result ? `${result.total} resultado${result.total === 1 ? "" : "s"}` : ""}
          </span>
        </div>
        <div className="card-body p-0">
          {loading && !result ? (
            <div className="p-5 text-center">
              <div className="spinner-border text-primary" role="status" />
            </div>
          ) : invoices.length === 0 ? (
            <p className="p-4 text-center text-secondary mb-0">
              No se encontraron comprobantes.
            </p>
          ) : (
            <div className="table-responsive" style={{ opacity: loading ? 0.6 : 1 }}>
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Fecha</th><th>Comprobante</th><th>Ambiente</th><th>Cliente</th>
                    <th className="text-end">Total</th><th>CAE</th>
                    <th>F. Vto. CAE</th><th className="text-end">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td>{formatDate(i.issue_date ?? i.created_at)}</td>
                      <td><InvoiceNumberCell invoice={i} /></td>
                        <td><AfipEnvironmentBadge environment={i.afip_environment} /></td>
                      <td>{i.customer?.name ?? "—"}</td>
                      <td className={`text-end ${isCreditNote(i) ? "text-danger" : ""}`}>
                        {i.total == null ? "—" : isCreditNote(i) ? `−${Number(i.total).toFixed(2)}` : String(i.total)}
                      </td>
                      <td>{i.cae ?? "—"}</td>
                      <td>{formatDate(i.cae_expiration)}</td>
                      <td className="text-end">
                        <InvoiceActions invoice={i} onChanged={() => setReloadToken((n) => n + 1)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {result && result.total > 0 && (
          <div className="card-footer d-flex flex-wrap justify-content-between align-items-center gap-2">
            <div className="d-flex align-items-center gap-2">
              <label className="small text-secondary mb-0" htmlFor="f-size">Por página</label>
              <select id="f-size" className="form-select form-select-sm w-auto" value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="small text-secondary">
                {result.from}–{result.to} de {result.total}
              </span>
            </div>
            <div className="btn-group">
              <button className="btn btn-outline-secondary btn-sm" type="button"
                disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>
                « Anterior
              </button>
              <span className="btn btn-outline-secondary btn-sm disabled">
                Página {result.current_page} de {result.last_page}
              </span>
              <button className="btn btn-outline-secondary btn-sm" type="button"
                disabled={loading || page >= result.last_page}
                onClick={() => setPage((p) => p + 1)}>
                Siguiente »
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default InvoiceSearch;
