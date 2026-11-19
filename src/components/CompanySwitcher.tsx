import { useState } from "react";
import { Building2 } from "lucide-react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { getMyOrganizations, switchOrganization } from "../services/organizationService";
import { reloadAt } from "../utils/navigation";
import StatusAlert from "./StatusAlert";
import { useQuery } from "./useQuery";

/**
 * Empresa con la que se está trabajando. Con una sola es solo un rótulo; con varias, un selector para cambiar sin volver
 * a iniciar sesión (recarga la aplicación para no dejar datos de la empresa anterior).
 */
const CompanySwitcher = () => {
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");

  const { data } = useQuery((signal) => getMyOrganizations(signal), [], "No se pudieron cargar las empresas");

  // Sin datos (auth-api caído, sesión anterior a las empresas): no se muestra nada, la pantalla funciona igual
  if (!data || data.organizations.length === 0) return null;

  const current = data.organizations.find((org) => org.id === data.current) ?? (data.organizations.length === 1 ? data.organizations[0] : null);

  const change = async (organizationId: number) => {
    if (organizationId === data.current) return;
    setSwitching(true);
    setError("");

    try {
      await switchOrganization(organizationId);
      reloadAt("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar de empresa");
      setSwitching(false);
    }
  };

  return (
    <div className="space-y-2 px-2 group-data-[collapsible=icon]:hidden" data-testid="company-switcher">
      {data.organizations.length === 1 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" title="Empresa">
          <Building2 className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{current?.name ?? data.organizations[0].name}</span>
        </p>
      ) : (
        <div className="space-y-1">
          <label htmlFor="company-select" className="flex items-center gap-2 text-xs text-muted-foreground">
            <Building2 className="size-3.5" aria-hidden="true" />
            Empresa
          </label>
          <NativeSelect
            id="company-select"
            size="sm"
            value={current?.id ?? ""}
            disabled={switching}
            onChange={(e) => void change(Number(e.target.value))}
          >
            {current === null && (
              <NativeSelectOption value="" disabled>
                Elegí una empresa
              </NativeSelectOption>
            )}
            {data.organizations.map((org) => (
              <NativeSelectOption key={org.id} value={org.id}>
                {org.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
      {error && <StatusAlert kind="error">{error}</StatusAlert>}
    </div>
  );
};

export default CompanySwitcher;
