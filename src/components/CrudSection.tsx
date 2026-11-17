import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  createResource,
  deleteResource,
  getResource,
  getResources,
  updateResource,
} from "../services/crudService";
import type {
  FieldConfig,
  FormValues,
  Resource,
  ResourceId,
} from "../types/crud";

interface CrudSectionProps {
  title: string;
  singularName: string;
  endpoint: string;
  fields: FieldConfig[];
  single?: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isResource = (value: unknown): value is Resource =>
  isRecord(value) &&
  (typeof value.id === "string" || typeof value.id === "number");

const getEmptyForm = (fields: FieldConfig[]): FormValues =>
  Object.fromEntries(fields.map(({ name }) => [name, ""]));

const normalizeResources = (payload: unknown): Resource[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter(isResource);
  if (isRecord(payload) && Array.isArray(payload.data)) {
    return payload.data.filter(isResource);
  }
  return isResource(payload) ? [payload] : [];
};

const getOptionLabel = (option: Resource): string =>
  String(
    option.name ??
      option.description ??
      option.label ??
      option.code ??
      option.id,
  );

const CrudSection = ({
  title,
  singularName,
  endpoint,
  fields,
  single = false,
}: CrudSectionProps) => {
  const emptyForm = useMemo(() => getEmptyForm(fields), [fields]);
  const referenceFields = useMemo(
    () => fields.filter((field) => field.optionsEndpoint),
    [fields],
  );
  const [items, setItems] = useState<Resource[]>([]);
  const [referenceOptions, setReferenceOptions] = useState<
    Record<string, Resource[]>
  >({});
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<ResourceId | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const payload = await getResources(endpoint);
      setItems(normalizeResources(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los datos");
    } finally {
      setIsLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    let isCurrent = true;

    Promise.all([
      getResources(endpoint),
      ...referenceFields.map((field) =>
        getResources(field.optionsEndpoint as string),
      ),
    ])
      .then(([payload, ...optionsPayloads]) => {
        if (!isCurrent) return;

        setItems(normalizeResources(payload));
        setReferenceOptions(
          Object.fromEntries(
            referenceFields.map((field, index) => [
              field.name,
              normalizeResources(optionsPayloads[index]),
            ]),
          ),
        );
      })
      .catch((err) => {
        if (isCurrent) {
          setError(
            err instanceof Error ? err.message : "No se pudieron cargar los datos",
          );
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [endpoint, referenceFields]);

  const openCreateForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setSuccessMessage("");
    setIsFormOpen(true);
  };

  const openEditForm = async (item: Resource) => {
    setError("");
    setSuccessMessage("");

    try {
      const resource = single
        ? item
        : await getResource<Resource>(endpoint, item.id);

      setForm(
        Object.fromEntries(
          fields.map(({ name }) => [name, String(resource[name] ?? "")]),
        ),
      );
      setEditingId(item.id);
      setIsFormOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el registro");
    }
  };

  const closeForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      if (editingId !== null) {
        await updateResource(endpoint, editingId, form);
        setSuccessMessage(`${singularName} actualizado correctamente.`);
      } else {
        await createResource(endpoint, form);
        setSuccessMessage(`${singularName} creado correctamente.`);
      }

      closeForm();
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: Resource) => {
    if (!window.confirm(`¿Querés eliminar este ${singularName.toLowerCase()}?`)) {
      return;
    }

    setError("");
    setSuccessMessage("");

    try {
      await deleteResource(endpoint, item.id);
      setSuccessMessage(`${singularName} eliminado correctamente.`);
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  };

  return (
    <section>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
        <div>
          <h2 className="h5 mb-1">Gestión de {title.toLowerCase()}</h2>
          <p className="text-secondary mb-0">
            Creá, consultá y actualizá tus {title.toLowerCase()}.
          </p>
        </div>
        {(!single || items.length === 0) && !isFormOpen && (
          <button className="btn btn-primary" type="button" onClick={openCreateForm}>
            Agregar {singularName.toLowerCase()}
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {successMessage && (
        <div className="alert alert-success">{successMessage}</div>
      )}

      {isFormOpen && (
        <div className="card card-primary card-outline mb-4">
          <div className="card-header">
            <h3 className="card-title">
              {editingId !== null ? "Editar" : "Agregar"} {singularName.toLowerCase()}
            </h3>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit}>
              <div className="row g-3">
                {fields.map((field) => (
                  <div className={field.columnClass || "col-12 col-md-6"} key={field.name}>
                    <label className="form-label" htmlFor={`${endpoint}-${field.name}`}>
                      {field.label}
                    </label>
                    {field.optionsEndpoint ? (
                      <select
                        className="form-select"
                        id={`${endpoint}-${field.name}`}
                        name={field.name}
                        value={form[field.name]}
                        onChange={handleChange}
                        required={field.required}
                      >
                        <option value="">Seleccionar...</option>
                        {(referenceOptions[field.name] || []).map((option) => (
                          <option key={option.id} value={option.id}>
                            {getOptionLabel(option)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="form-control"
                        id={`${endpoint}-${field.name}`}
                        name={field.name}
                        type={field.type || "text"}
                        value={form[field.name]}
                        onChange={handleChange}
                        required={field.required}
                        placeholder={field.placeholder}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="d-flex gap-2 mt-4 pt-3 border-top">
                <button className="btn btn-primary" type="submit" disabled={isSaving}>
                  {isSaving ? "Guardando..." : "Guardar"}
                </button>
                <button className="btn btn-secondary" type="button" onClick={closeForm}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card card-primary card-outline">
        <div className="card-header">
          <h3 className="card-title">Listado de {title.toLowerCase()}</h3>
        </div>
        <div className="card-body p-0">
          {isLoading ? (
            <div className="p-5 text-center">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Cargando...</span>
              </div>
            </div>
          ) : items.length === 0 ? (
            <p className="p-5 text-center text-secondary mb-0">No hay registros.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    {fields.map((field) => (
                      <th key={field.name}>{field.label}</th>
                    ))}
                    <th className="text-end">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      {fields.map((field) => (
                        <td key={field.name}>
                          {field.optionsEndpoint
                            ? getOptionLabel(
                                (referenceOptions[field.name] || []).find(
                                  (option) =>
                                    String(option.id) === String(item[field.name]),
                                ) || { id: String(item[field.name] || "—") },
                              )
                            : String(item[field.name] || "—")}
                        </td>
                      ))}
                      <td className="text-end text-nowrap">
                        <button
                          className="btn btn-sm btn-outline-primary me-2"
                          type="button"
                          onClick={() => openEditForm(item)}
                        >
                          Editar
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          type="button"
                          onClick={() => handleDelete(item)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default CrudSection;
