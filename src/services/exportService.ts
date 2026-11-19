import { apiDownload } from "./apiClient";

export type ExportScope = "page" | "all";

export interface ExportedFile {
  fileName: string;
  rows: number | null;
}

/** Guarda un archivo en el equipo (descarga del navegador). */
export const saveBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Pide la exportación al servidor y la descarga. El servidor aplica los mismos filtros que la grilla:
 * - scope `page`: lo que se ve en pantalla (la página actual);
 * - scope `all`: todos los resultados de la búsqueda, de todas las páginas.
 */
export const downloadExport = async (path: string, scope: ExportScope, params: Record<string, string> = {}): Promise<ExportedFile> => {
  const query = new URLSearchParams({ ...params, scope });
  const { blob, fileName, rows } = await apiDownload(`${path}?${query.toString()}`);
  const name = fileName ?? "exportacion.xlsx";

  saveBlob(blob, name);

  return { fileName: name, rows };
};
