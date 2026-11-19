import { useState, type FormEvent } from "react";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useSystemAdmin } from "../hooks/useSystemAdmin";
import { getSystemSettings, updateSystemName } from "../services/systemService";
import FormField from "./FormField";
import LoadingBlock from "./LoadingBlock";
import { NoPermission } from "./RequirePermission";
import StatusAlert from "./StatusAlert";
import { useQuery } from "./useQuery";

/** Sistema: ajustes de toda la plataforma. Solo la administración del sistema. El correo (SMTP) se configura en el servidor. */
const System = () => {
  const isSystemAdmin = useSystemAdmin();
  const [reload, setReload] = useState(0);
  const [edit, setEdit] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const { data, loading, error: loadError } = useQuery(
    (signal) => (isSystemAdmin ? getSystemSettings(signal) : Promise.resolve(null)),
    [reload, isSystemAdmin],
    "No se pudieron cargar los ajustes",
  );

  // Mientras se consulta el rol no se muestra el aviso de "sin permiso": evita un parpadeo
  if (!isSystemAdmin) return loading ? <LoadingBlock /> : <NoPermission />;
  if (loading && !data) return <LoadingBlock />;

  const name = edit ?? data?.system_name ?? "";
  const changed = data !== null && name.trim() !== data.system_name;

  const save = async (value: string | null) => {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      await updateSystemName(value);
      setEdit(null);
      setSaved(true);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void save(name.trim() === "" ? null : name.trim());
  };

  return (
    <section className="space-y-6">
      <p className="text-muted-foreground">Ajustes de toda la plataforma, no de una empresa.</p>

      {loadError && <StatusAlert kind="error">{loadError}</StatusAlert>}
      {error && <StatusAlert kind="error">{error}</StatusAlert>}
      {saved && <StatusAlert kind="success">Ajustes guardados.</StatusAlert>}

      <form onSubmit={handleSubmit} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Nombre del sistema</CardTitle>
            <CardDescription>
              Aparece en el encabezado, el pie y el remitente de los correos, y en la pantalla de ingreso.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FormField label="Nombre" htmlFor="system-name" hint={`Hasta ${data?.max_length ?? 60} caracteres. Por defecto: ${data?.default_system_name ?? ""}.`}>
              <Input
                id="system-name"
                value={name}
                maxLength={data?.max_length ?? 60}
                onChange={(e) => {
                  setSaved(false);
                  setEdit(e.target.value);
                }}
              />
            </FormField>
            <p className="text-xs text-muted-foreground">
              El servidor de correo (SMTP) y sus contraseñas se configuran en el servidor, no desde acá.
            </p>
          </CardContent>
          <CardFooter className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving || data === null || data.is_default}
              onClick={() => void save(null)}
            >
              <RotateCcw />
              Usar el nombre por defecto
            </Button>
            <Button type="submit" disabled={saving || !changed}>
              {saving ? <Spinner aria-label="Guardando" /> : <Save />}
              Guardar cambios
            </Button>
          </CardFooter>
        </Card>
      </form>
    </section>
  );
};

export default System;
