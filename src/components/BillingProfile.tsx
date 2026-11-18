import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import DateInput from "./DateInput";
import FormField from "./FormField";
import LoadingBlock from "./LoadingBlock";
import StatusAlert from "./StatusAlert";
import { apiRequest } from "../services/apiClient";
import { createResource, updateResource } from "../services/crudService";
import type { FormValues, ResourceId } from "../types/crud";

interface ProfileField {
  name: string;
  label: string;
  type: "text" | "date" | "select";
  required?: boolean;
  fullWidth?: boolean;
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
    fullWidth: true,
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
      <Card>
        <CardContent>
          <LoadingBlock message="Cargando perfil de facturación..." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Información fiscal</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Estos datos se utilizarán para emitir tus comprobantes.
          </p>
          {error && <StatusAlert kind="error">{error}</StatusAlert>}
          {successMessage && <StatusAlert kind="success">{successMessage}</StatusAlert>}
          <div className="grid gap-4 md:grid-cols-2">
            {profileFields.map((field) => (
              <FormField
                key={field.name}
                label={field.label}
                htmlFor={`billing-profile-${field.name}`}
                className={field.fullWidth ? "md:col-span-2" : undefined}
              >
                {field.type === "select" ? (
                  <NativeSelect
                    id={`billing-profile-${field.name}`}
                    name={field.name}
                    value={form[field.name]}
                    onChange={handleChange}
                    required={field.required}
                  >
                    <NativeSelectOption value="">Seleccione una opción</NativeSelectOption>
                    {(field.name === "document_type_id" ? documentTypes : taxConditions).map(
                      (option) => (
                        <NativeSelectOption key={option.id} value={option.id}>
                          {option.name}
                        </NativeSelectOption>
                      ),
                    )}
                  </NativeSelect>
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
                  <Input
                    id={`billing-profile-${field.name}`}
                    type={field.type}
                    name={field.name}
                    value={form[field.name]}
                    onChange={handleChange}
                    required={field.required}
                  />
                )}
              </FormField>
            ))}
          </div>
        </CardContent>
        <CardFooter className="mt-6 border-t pt-6">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};

export default BillingProfile;
