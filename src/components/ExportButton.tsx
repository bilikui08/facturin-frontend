import { useState } from "react";
import { Check, ChevronDown, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { downloadExport, type ExportScope } from "../services/exportService";

export interface ExportOption {
  id: ExportScope;
  /** Corto y claro: "Pantalla", "Todo" */
  label: string;
  /** Qué exporta exactamente (y cuántas filas) */
  description: string;
  rows: number;
}

interface ExportButtonProps {
  /** Ruta de la exportación en la API, por ejemplo `/invoices/export` */
  path: string;
  /** Qué se puede exportar. Con una sola opción (o si dan lo mismo) es un botón directo; con dos, un menú. */
  options: ExportOption[];
  /** Los filtros vigentes de la grilla (sin vacíos): el servidor exporta con los mismos. */
  filters?: Record<string, string>;
  /** Parámetros que solo van con una opción (por ejemplo, `page` y `per_page` para "Pantalla"). */
  extraParams?: Partial<Record<ExportScope, Record<string, string>>>;
}

/**
 * "Exportar a Excel" de una grilla. Nunca es ambiguo qué se exporta:
 * - Pantalla: lo que se ve ahora (la página actual);
 * - Todo: todos los resultados de la búsqueda actual, de todas las páginas (con los filtros aplicados).
 * Si todo cabe en la pantalla, las dos opciones darían lo mismo y se ofrece un solo botón con la cantidad de filas.
 */
const ExportButton = ({ path, options, filters = {}, extraParams = {} }: ExportButtonProps) => {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  // Dos opciones con la misma cantidad de filas son lo mismo: se ofrece solo "Todo"
  const effective = options.length > 1 && options[0].rows === options[options.length - 1].rows
    ? options.filter((option) => option.id === "all")
    : options;

  const run = async (option: ExportOption) => {
    setError("");
    setDone("");
    setBusy(true);

    try {
      const file = await downloadExport(path, option.id, { ...filters, ...(extraParams[option.id] ?? {}) });
      setDone(`Se descargó ${file.fileName}${file.rows === null ? "" : ` (${file.rows} fila${file.rows === 1 ? "" : "s"})`}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo exportar");
    } finally {
      setBusy(false);
    }
  };

  const icon = busy ? <Spinner aria-label="Exportando" /> : <FileSpreadsheet aria-hidden="true" />;

  return (
    <div className="flex flex-col items-end gap-1">
      {effective.length <= 1 ? (
        <Button type="button" variant="outline" size="sm" disabled={busy || effective.length === 0} onClick={() => effective[0] && void run(effective[0])}>
          {icon}
          {busy ? "Exportando..." : `Exportar a Excel${effective[0] ? ` (${effective[0].rows} fila${effective[0].rows === 1 ? "" : "s"})` : ""}`}
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={busy}>
              {icon}
              {busy ? "Exportando..." : "Exportar a Excel"}
              {!busy && <ChevronDown aria-hidden="true" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>¿Qué querés exportar?</DropdownMenuLabel>
            {effective.map((option) => (
              <DropdownMenuItem key={option.id} onSelect={() => void run(option)}>
                <span className="font-medium">
                  {option.label} <span className="font-normal text-muted-foreground">({option.rows} fila{option.rows === 1 ? "" : "s"})</span>
                </span>
                <span className="max-w-64 text-xs text-muted-foreground">{option.description}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {done && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground" role="status">
          <Check className="size-3" aria-hidden="true" />
          {done}
        </p>
      )}
      {error && (
        <p className="max-w-80 text-right text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default ExportButton;
