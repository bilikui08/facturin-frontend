import { useState, type FormEvent } from "react";
import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { P } from "../config/permissions";
import { useAccess } from "../hooks/useAccess";
import { getSettings, updateSettings } from "../services/settingsService";
import type { SettingDefinition } from "../types/settings";
import LoadingBlock from "./LoadingBlock";
import StatusAlert from "./StatusAlert";
import TwoFactorCard from "./TwoFactorCard";
import { useQuery } from "./useQuery";

/** Agrupa los parámetros por sección, respetando el orden en que llegan. */
const groupSettings = (settings: SettingDefinition[]): [string, SettingDefinition[]][] => {
  const groups = new Map<string, SettingDefinition[]>();
  settings.forEach((setting) => groups.set(setting.group, [...(groups.get(setting.group) ?? []), setting]));
  return [...groups.entries()];
};

/** Configuración: parámetros del usuario. La pantalla se arma sola a partir de lo que describe la API. */
const Settings = () => {
  const readOnly = !useAccess().can(P.settingsManage);
  const [reload, setReload] = useState(0);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const { data, loading, error: loadError } = useQuery(
    (signal) => getSettings(signal),
    [reload],
    "No se pudo cargar la configuración",
  );

  const settings = data ?? [];
  const shown = (setting: SettingDefinition) => edits[setting.key] ?? String(setting.value);
  const changed = settings.filter((setting) => shown(setting) !== String(setting.value));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSaved(false);

    const values: Record<string, number> = {};

    for (const setting of changed) {
      const value = Number(shown(setting));
      if (!Number.isInteger(value) || value < setting.min || value > setting.max) {
        setError(`«${setting.label}» debe estar entre ${setting.min} y ${setting.max} ${setting.unit}.`);
        return;
      }
      values[setting.key] = value;
    }

    setSaving(true);

    try {
      await updateSettings(values);
      setEdits({});
      setSaved(true);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <LoadingBlock />;

  return (
    <section className="space-y-6">
      {/* La seguridad de la cuenta es de la persona (no de la empresa): la ve cualquiera, con o sin permiso para cambiar los parámetros */}
      <TwoFactorCard />

      <p className="text-muted-foreground">Parámetros de Facturín. Cada cambio queda registrado en la Auditoría.</p>
      {readOnly && <StatusAlert kind="error">Podés ver la configuración, pero no cambiarla: no tenés ese permiso en esta empresa.</StatusAlert>}

      {loadError && <StatusAlert kind="error">{loadError}</StatusAlert>}
      {error && <StatusAlert kind="error">{error}</StatusAlert>}
      {saved && <StatusAlert kind="success">Configuración guardada.</StatusAlert>}

      {/* noValidate: la validación (rango entero, mensajes en español) la hace la pantalla, no el navegador */}
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {groupSettings(settings).map(([group, items]) => (
          <Card key={group}>
            <CardHeader>
              <CardTitle>{group}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {items.map((setting) => (
                <div key={setting.key} className="space-y-2">
                  <Label htmlFor={`setting-${setting.key}`}>{setting.label}</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id={`setting-${setting.key}`}
                      type="number"
                      inputMode="numeric"
                      className="w-28"
                      min={setting.min}
                      max={setting.max}
                      step={1}
                      disabled={readOnly}
                      value={shown(setting)}
                      onChange={(e) => {
                        setSaved(false);
                        setEdits((current) => ({ ...current, [setting.key]: e.target.value }));
                      }}
                    />
                    <span className="text-sm text-muted-foreground">{setting.unit}</span>
                    {!readOnly && shown(setting) !== String(setting.default) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSaved(false);
                          setEdits((current) => ({ ...current, [setting.key]: String(setting.default) }));
                        }}
                      >
                        <RotateCcw />
                        Usar el valor por defecto ({setting.default})
                      </Button>
                    )}
                  </div>
                  <CardDescription>{setting.description}</CardDescription>
                  <p className="text-xs text-muted-foreground">
                    Entre {setting.min} y {setting.max} {setting.unit}. Por defecto: {setting.default}.
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {settings.length > 0 && (
          <Card>
            <CardFooter className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                {changed.length === 0 ? "No hay cambios sin guardar." : `${changed.length} cambio${changed.length === 1 ? "" : "s"} sin guardar.`}
              </span>
              <Button type="submit" disabled={readOnly || changed.length === 0 || saving}>
                {saving ? <Spinner aria-label="Guardando" /> : <Save />}
                Guardar cambios
              </Button>
            </CardFooter>
          </Card>
        )}
      </form>
    </section>
  );
};

export default Settings;
