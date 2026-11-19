import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExportButton, { type ExportOption } from "../ExportButton";

const downloadExport = vi.fn();

vi.mock("../../services/exportService", () => ({
  downloadExport: (...args: unknown[]) => downloadExport(...args),
}));

const pageAndAll: ExportOption[] = [
  { id: "page", label: "Pantalla", description: "Lo que estás viendo: la página 2.", rows: 10 },
  { id: "all", label: "Todo", description: "Todos los resultados de la búsqueda, de todas las páginas.", rows: 143 },
];

const open = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: /Exportar a Excel/ }));

beforeEach(() => {
  downloadExport.mockReset().mockResolvedValue({ fileName: "comprobantes-2026-11-19.xlsx", rows: 143 });
});

describe("Exportar a Excel", () => {
  it("con dos alcances ofrece un menú que explica exactamente qué se exporta y cuántas filas", async () => {
    render(<ExportButton path="/invoices/export" options={pageAndAll} />);
    const user = userEvent.setup();

    await open(user);

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("¿Qué querés exportar?")).toBeTruthy();
    expect(within(menu).getByText("Pantalla")).toBeTruthy();
    expect(within(menu).getByText("(10 filas)")).toBeTruthy();
    expect(within(menu).getByText("Lo que estás viendo: la página 2.")).toBeTruthy();
    expect(within(menu).getByText("Todo")).toBeTruthy();
    expect(within(menu).getByText("(143 filas)")).toBeTruthy();
    expect(within(menu).getByText(/de todas las páginas/)).toBeTruthy();
  });

  it("Pantalla exporta la página actual: manda los filtros de la grilla y la página, no solo el alcance", async () => {
    render(
      <ExportButton
        path="/invoices/export"
        options={pageAndAll}
        filters={{ customer: "Pérez", afip_environment: "produccion" }}
        extraParams={{ page: { page: "2", per_page: "10" } }}
      />,
    );
    const user = userEvent.setup();

    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: /Pantalla/ }));

    expect(downloadExport).toHaveBeenCalledWith("/invoices/export", "page", { customer: "Pérez", afip_environment: "produccion", page: "2", per_page: "10" });
  });

  it("Todo exporta todas las páginas con los mismos filtros, pero sin la página", async () => {
    render(
      <ExportButton path="/invoices/export" options={pageAndAll} filters={{ customer: "Pérez" }} extraParams={{ page: { page: "2", per_page: "10" } }} />,
    );
    const user = userEvent.setup();

    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: /Todo/ }));

    expect(downloadExport).toHaveBeenCalledWith("/invoices/export", "all", { customer: "Pérez" });
  });

  it("si todo cabe en la pantalla las dos opciones serían lo mismo: un solo botón directo con la cantidad", async () => {
    render(
      <ExportButton
        path="/invoices/export"
        options={[
          { id: "page", label: "Pantalla", description: "x", rows: 7 },
          { id: "all", label: "Todo", description: "y", rows: 7 },
        ]}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Exportar a Excel (7 filas)" }));

    expect(screen.queryByRole("menu")).toBeNull();
    expect(downloadExport).toHaveBeenCalledWith("/invoices/export", "all", {});
  });

  it("con una sola opción es un botón directo (singular si es una fila)", async () => {
    render(<ExportButton path="/customers/export" options={[{ id: "all", label: "Todo", description: "Todos los clientes.", rows: 1 }]} />);

    expect(screen.getByRole("button", { name: "Exportar a Excel (1 fila)" })).toBeTruthy();
  });

  it("mientras exporta no se puede volver a tocar y avisa que está trabajando", async () => {
    let finish: (v: unknown) => void = () => undefined;
    downloadExport.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<ExportButton path="/customers/export" options={[{ id: "all", label: "Todo", description: "x", rows: 5 }]} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Exportar a Excel/ }));

    const busy = await screen.findByRole("button", { name: /Exportando/ });
    expect((busy as HTMLButtonElement).disabled).toBe(true);

    finish({ fileName: "clientes.xlsx", rows: 5 });
    await waitFor(() => expect((screen.getByRole("button", { name: /Exportar a Excel/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("cuando termina dice qué archivo bajó y cuántas filas tiene", async () => {
    render(<ExportButton path="/customers/export" options={[{ id: "all", label: "Todo", description: "x", rows: 143 }]} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Exportar a Excel/ }));

    expect(await screen.findByRole("status", { name: "" })).toBeTruthy();
    expect(await screen.findByText("Se descargó comprobantes-2026-11-19.xlsx (143 filas).")).toBeTruthy();
  });

  it("si el servidor la rechaza (demasiado grande) muestra su mensaje y se puede volver a intentar", async () => {
    downloadExport.mockRejectedValueOnce(new Error("La exportación tiene 60.000 filas y el máximo es 50.000. Acotá los filtros y volvé a intentar."));
    render(<ExportButton path="/invoices/export" options={pageAndAll} />);
    const user = userEvent.setup();

    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: /Todo/ }));

    expect((await screen.findByRole("alert")).textContent).toContain("Acotá los filtros");

    await open(user);
    await user.click(await screen.findByRole("menuitem", { name: /Pantalla/ }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(await screen.findByText(/Se descargó/)).toBeTruthy();
  });

  it("sin opciones no hay nada que exportar", () => {
    render(<ExportButton path="/invoices/export" options={[]} />);

    expect((screen.getByRole("button", { name: /Exportar a Excel/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
