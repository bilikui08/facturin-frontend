import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import FormField from "./FormField";
import ExportButton from "./ExportButton";
import LoadingBlock from "./LoadingBlock";
import StatusAlert from "./StatusAlert";
import UndoBanner from "./UndoBanner";
import { ApiError } from "../services/apiClient";
import {
  createResource,
  deleteResource,
  getResource,
  getResources,
  restoreResource,
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
  /** Solo consulta: sin botones para agregar, editar ni eliminar (la persona no tiene permiso de administrar). */
  readOnly?: boolean;
  /** Ruta de la exportación a Excel de esta grilla (por ejemplo `/customers/export`). Sin ella no hay botón de exportar. */
  exportPath?: string;
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

/** La última baja, para ofrecer "Deshacer" al momento. Todo lo eliminado también queda en la Papelera. */
interface LastDeleted {
  id: ResourceId;
  label: string;
}

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
  readOnly = false,
  exportPath,
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
  const [pendingDelete, setPendingDelete] = useState<Resource | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<LastDeleted | null>(null);

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
    setError("");
    setSuccessMessage("");

    try {
      await deleteResource(endpoint, item.id);

      // Pasó a la Papelera: se ofrece "Deshacer" al momento (puede cerrarse: sigue en la Papelera)
      setLastDeleted({ id: item.id, label: String(item[fields[0]?.name] ?? `#${item.id}`) });

      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  };

  const handleUndo = async () => {
    if (!lastDeleted) return;

    setUndoing(true);
    setError("");
    setSuccessMessage("");

    try {
      await restoreResource(endpoint, lastDeleted.id);
      setLastDeleted(null);
      setSuccessMessage(`${singularName} restaurado correctamente.`);
      await loadItems();
    } catch (err) {
      // Ya restaurado o no corresponde: el aviso ya no sirve. Un corte de red permite reintentar.
      if (err instanceof ApiError && (err.status === 404 || err.status === 422)) setLastDeleted(null);
      setError(err instanceof Error ? err.message : "No se pudo deshacer");
    } finally {
      setUndoing(false);
    }
  };

  const columnValue = (item: Resource, field: FieldConfig): string =>
    field.optionsEndpoint
      ? getOptionLabel(
          (referenceOptions[field.name] || []).find(
            (option) => String(option.id) === String(item[field.name]),
          ) || { id: String(item[field.name] || "—") },
        )
      : String(item[field.name] || "—");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">
          {readOnly ? `Consultá tus ${title.toLowerCase()}.` : `Creá, consultá y actualizá tus ${title.toLowerCase()}.`}
        </p>
        <div className="flex flex-wrap items-start gap-2">
          {exportPath && items.length > 0 && (
            <ExportButton
              path={exportPath}
              options={[{ id: "all", label: "Todo", description: `Todos los ${title.toLowerCase()}.`, rows: items.length }]}
            />
          )}
          {!readOnly && (!single || items.length === 0) && !isFormOpen && (
            <Button type="button" onClick={openCreateForm}>
              <Plus />
              Agregar {singularName.toLowerCase()}
            </Button>
          )}
        </div>
      </div>

      {error && <StatusAlert kind="error">{error}</StatusAlert>}
      {successMessage && <StatusAlert kind="success">{successMessage}</StatusAlert>}
      {lastDeleted && (
        <UndoBanner
          singularName={singularName}
          label={lastDeleted.label}
          undoing={undoing}
          onUndo={handleUndo}
          onDismiss={() => setLastDeleted(null)}
        />
      )}

      {isFormOpen && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingId !== null ? "Editar" : "Agregar"} {singularName.toLowerCase()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                {fields.map((field) => (
                  <FormField
                    key={field.name}
                    label={field.label}
                    htmlFor={`${endpoint}-${field.name}`}
                    className={field.fullWidth ? "md:col-span-2" : undefined}
                  >
                    {field.optionsEndpoint ? (
                      <NativeSelect
                        id={`${endpoint}-${field.name}`}
                        name={field.name}
                        value={form[field.name]}
                        onChange={handleChange}
                        required={field.required}
                      >
                        <NativeSelectOption value="">Seleccionar...</NativeSelectOption>
                        {(referenceOptions[field.name] || []).map((option) => (
                          <NativeSelectOption key={option.id} value={option.id}>
                            {getOptionLabel(option)}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    ) : (
                      <Input
                        id={`${endpoint}-${field.name}`}
                        name={field.name}
                        type={field.type || "text"}
                        value={form[field.name]}
                        onChange={handleChange}
                        required={field.required}
                        placeholder={field.placeholder}
                      />
                    )}
                  </FormField>
                ))}
              </div>
              <div className="mt-6 flex gap-2 border-t pt-4">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Guardando..." : "Guardar"}
                </Button>
                <Button variant="secondary" type="button" onClick={closeForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b py-4 [.border-b]:pb-4">
          <CardTitle className="text-base">Listado de {title.toLowerCase()}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <LoadingBlock />
          ) : items.length === 0 ? (
            <p className="p-10 text-center text-muted-foreground">No hay registros.</p>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  {fields.map((field) => (
                    <TableHead key={field.name}>{field.label}</TableHead>
                  ))}
                  {!readOnly && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    {fields.map((field) => (
                      <TableCell key={field.name}>{columnValue(item, field)}</TableCell>
                    ))}
                    {!readOnly && (
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => openEditForm(item)}
                        >
                          <Pencil />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPendingDelete(item)}
                        >
                          <Trash2 />
                          Eliminar
                        </Button>
                      </div>
                    </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {singularName.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              Dejará de aparecer en las listas, pero los comprobantes ya emitidos con este{" "}
              {singularName.toLowerCase()} se conservan. Vas a poder restaurarlo desde la Papelera.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const item = pendingDelete;
                setPendingDelete(null);
                if (item) void handleDelete(item);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default CrudSection;
