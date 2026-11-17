import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import DateInput from "./DateInput";
import { apiRequest } from "../services/apiClient";
import { createResource, updateResource } from "../services/crudService";
import type { FormValues, ResourceId } from "../types/crud";

interface ProfileField {
  name: string;
  label: string;
  type: "text" | "date" | "select";
  required?: boolean;
  columnClass?: string;
  optionsEndpoint?: string;
}

interface BillingProfileResource {
  id?: ResourceId;
  [key: string]: string | number | null | undefined;
}

interface SelectOption {
  id: ResourceId;
  name: string;
}

// Esto deberia venir de un model, pero por ser la primera vez que uso React lo dejo asi por ahora. 
// En el futuro, si se hace un model con un framework como Next.js, esto se podria traer de un model o de un archivo de constantes.
const profileFields = [
  { name: "first_name", label: "Nombre", required: true, type: "text" },
  { name: "last_name", label: "Apellido", required: true, type: "text" },
  { name: "business_name", label: "Razón social", type: "text" },
  { name: "fantasy_name", label: "Nombre de fantasía", type: "text" },
  { name: "document_number", label: "Número de documento", required: true, type: "text" },
  {
    name: "document_type_id",
    label: "Tipo de documento",
    optionsEndpoint: "/document-types",
    required: true,
    type: "select",
  },
  {
    name: "tax_condition_id",
    label: "Condición fiscal",
    optionsEndpoint: "/tax-conditions",
    required: true,
    type: "select",
  },
  {
    name: "address",
    label: "Domicilio fiscal",
    columnClass: "col-12",
    required: true,
    type: "text",
  },
  { name: "gross_income_number", label: "Número de ingresos brutos", type: "text" },
  {
    name: "activity_start_date",
    label: "Inicio de actividades",
    type: "date",
  },
] satisfies ProfileField[];

const emptyForm: FormValues = Object.fromEntries(
  profileFields.map(({ name }) => [name, ""]),
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSelectOption = (value: unknown): value is SelectOption =>
  isRecord(value) &&
  (typeof value.id === "string" || typeof value.id === "number") &&
  typeof value.name === "string";

const normalizeOptions = (data: unknown): SelectOption[] => {
  if (Array.isArray(data)) return data.filter(isSelectOption);
  if (isRecord(data) && Array.isArray(data.data)) {
    return data.data.filter(isSelectOption);
  }
  return [];
};

const isBillingProfile = (value: unknown): value is BillingProfileResource =>
  isRecord(value);

const normalizeProfile = (data: unknown): BillingProfileResource | null => {
  if (Array.isArray(data)) {
    return data.find(isBillingProfile) ?? null;
  }
  return isBillingProfile(data) ? data as BillingProfileResource : null;
};

type BillingProfileData = [unknown, unknown, unknown];

let pendingBillingProfileRequest: Promise<BillingProfileData> | null = null;

const loadBillingProfileData = (): Promise<BillingProfileData> => {
  if (pendingBillingProfileRequest) return pendingBillingProfileRequest;

  const request: Promise<BillingProfileData> = Promise.all([
    apiRequest("/user-billing-profile"),
    apiRequest("/document-types"),
    apiRequest("/tax-conditions"),
  ]).finally(() => {
    if (pendingBillingProfileRequest === request) {
      pendingBillingProfileRequest = null;
    }
  });

  pendingBillingProfileRequest = request;
  return request;
};

interface BillingProfileProps {
  onSaved?: () => void;
}

const BillingProfile = ({ onSaved }: BillingProfileProps = {}) => {
  const [profile, setProfile] = useState<BillingProfileResource | null>(null);
  const [documentTypes, setDocumentTypes] = useState<SelectOption[]>([]);
  const [taxConditions, setTaxConditions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    let isCurrent = true;

    loadBillingProfileData()
      .then(([profileData, documentTypesData, taxConditionsData]) => {
        if (!isCurrent) return;

        const currentProfile = normalizeProfile(profileData);
        setProfile(currentProfile);
        setDocumentTypes(normalizeOptions(documentTypesData));
        setTaxConditions(normalizeOptions(taxConditionsData));
        setForm(
          Object.fromEntries(
            profileFields.map(({ name }) => [
              name,
              String(currentProfile?.[name] ?? ""),
            ]),
          ),
        );
      })
      .catch((err) => {
        if (isCurrent) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar el perfil de facturación",
          );
        }
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

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
      const profileExists = profile?.id != null;
      const savedProfile = profileExists
        ? await updateResource<BillingProfileResource>(
            "/user-billing-profile",
            profile.id as ResourceId,
            form,
          )
        : await createResource<BillingProfileResource>(
            "/user-billing-profile",
            form,
          );

      setProfile(normalizeProfile(savedProfile) || { ...profile, ...form });
      setSuccessMessage(
        `Perfil de facturación ${profileExists ? "actualizado" : "creado"} correctamente.`,
      );
      onSaved?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el perfil de facturación",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card card-primary card-outline">
        <div className="card-body p-5 text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
          <p className="text-secondary mt-3 mb-0">Cargando perfil de facturación...</p>
        </div>
      </div>
    );
  }

  return (
    <section className="card card-primary card-outline">
      <div className="card-header">
        <h2 className="card-title">Información fiscal</h2>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="card-body">
          <p className="text-secondary mb-4">
            Estos datos se utilizarán para emitir tus comprobantes.
          </p>
          {error && <div className="alert alert-danger">{error}</div>}
          {successMessage && (
            <div className="alert alert-success">{successMessage}</div>
          )}
          <div className="row g-3">
            {profileFields.map((field) => (
              <div className={field.columnClass || "col-12 col-md-6"} key={field.name}>
                <label className="form-label" htmlFor={`billing-profile-${field.name}`}>
                  {field.label}
                </label>
                {field.type === "select" ? (
                  <select
                    className="form-select"
                    id={`billing-profile-${field.name}`}
                    name={field.name}
                    value={form[field.name]}
                    onChange={handleChange}
                    required={field.required}
                  >
                    <option value="">Seleccione una opción</option>
                    {(field.name === "document_type_id"
                      ? documentTypes.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))
                      : taxConditions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        )))}
                  </select>
                ) : field.type === "date" ? (
                  <DateInput
                    id={`billing-profile-${field.name}`}
                    name={field.name}
                    value={form[field.name]}
                    onChange={(name, value) =>
                      setForm((current) => ({ ...current, [name]: value }))
                    }
                    required={field.required}
                  />
                ) : (
                  <input
                    className="form-control"
                    id={`billing-profile-${field.name}`}
                    type={field.type}
                    name={field.name}
                    value={form[field.name]}
                    onChange={handleChange}
                    required={field.required}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="card-footer">
          <button className="btn btn-primary" type="submit" disabled={isSaving}>
            {isSaving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>
    </section>
  );
};

export default BillingProfile;
