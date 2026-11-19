import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RestoreResult, TrashData, TrashItem } from "../../types/trash";
import Trash from "../Trash";

const getTrash = vi.fn();
const restoreTrashItems = vi.fn();

vi.mock("../../services/trashService", () => ({
  getTrash: (...a: unknown[]) => getTrash(...a),
  restoreTrashItems: (...a: unknown[]) => restoreTrashItems(...a),
}));

const item = (extra: Partial<TrashItem>): TrashItem => ({
  type: "customer",
  type_label: "Cliente",
  id: 6,
  label: "Test 2 Monotributo",
  deleted_at: "2026-11-18T21:03:00-03:00",
  ...extra,
});

const data = (items: TrashItem[], extra: Partial<TrashData> = {}): TrashData => ({
  items,
  total: items.length,
  page: 1,
  per_page: 20,
  last_page: 1,
  ...extra,
});

const renderTrash = () =>
  render(
    <MemoryRouter>
      <Trash />
    </MemoryRouter>,
  );

const two = [item({}), item({ type: "sale_point", type_label: "Punto de venta", id: 3, label: "1 - Sucursal" })];

describe("Papelera de reciclaje", () => {
  beforeEach(() => {
    getTrash.mockReset().mockResolvedValue(data(two));
    restoreTrashItems.mockReset().mockResolvedValue({ restored: [], failed: [] } satisfies RestoreResult);
  });

  it("lista lo eliminado con fecha, entidad y el botón de restaurar, sin columna de vencimiento", async () => {
    renderTrash();

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Test 2 Monotributo")).toBeTruthy();
    expect(table.getByText("#6")).toBeTruthy();
    expect(table.getByText("1 - Sucursal")).toBeTruthy();
    expect(table.getByText("Punto de venta")).toBeTruthy();
    expect(table.getAllByRole("button", { name: /^Restaurar/ })).toHaveLength(2);
    expect(table.queryByText(/Se conserva hasta/)).toBeNull();
    expect(screen.queryByText(/\d+ días/)).toBeNull();
    expect(screen.getByText("2 registros en la papelera")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Cambiar el plazo" })).toBeNull();
  });

  it("pide la primera página de 20 sin filtro", async () => {
    renderTrash();

    await screen.findByRole("table");
    expect(getTrash.mock.calls[0][0]).toEqual({ type: undefined, page: 1, perPage: 20 });
  });

  it("filtra por tipo y vuelve a la primera página", async () => {
    getTrash.mockResolvedValue(data(two, { total: 45, last_page: 3 }));
    renderTrash();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(getTrash).toHaveBeenLastCalledWith({ type: undefined, page: 2, perPage: 20 }, expect.anything()));

    await user.selectOptions(screen.getByLabelText("Tipo"), "sale_point");
    await waitFor(() => expect(getTrash).toHaveBeenLastCalledWith({ type: "sale_point", page: 1, perPage: 20 }, expect.anything()));
  });

  it("pagina: Siguiente / Anterior y el tamaño de página", async () => {
    getTrash.mockImplementation(async ({ page, perPage }: { page: number; perPage: number }) =>
      data(two, { total: 45, page, per_page: perPage, last_page: Math.ceil(45 / perPage) }),
    );
    renderTrash();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    expect(await screen.findByText("Página 1 de 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anterior" })).toHaveProperty("disabled", true);

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(await screen.findByText("Página 2 de 3")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(await screen.findByText("Página 3 de 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Siguiente" })).toHaveProperty("disabled", true);

    await user.selectOptions(screen.getByLabelText("Por página"), "50");
    expect(await screen.findByText("Página 1 de 1")).toBeTruthy();
  });

  it("al cambiar de página se descarta la selección", async () => {
    getTrash.mockResolvedValue(data(two, { total: 45, last_page: 3 }));
    renderTrash();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("checkbox", { name: "Seleccionar todos" }));
    expect(screen.getByRole("button", { name: "Restaurar seleccionados (2)" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(await screen.findByRole("button", { name: /Restaurar seleccionados$/ })).toHaveProperty("disabled", true);
  });

  it("si se restaura todo lo de la última página vuelve a la anterior", async () => {
    restoreTrashItems.mockResolvedValue({
      restored: [
        { type: "customer", id: 6, label: "x" },
        { type: "sale_point", id: 3, label: "y" },
      ],
      failed: [],
    });
    getTrash.mockImplementation(async ({ page }: { page: number }) => data(two, { total: 22, page, last_page: 2 }));
    renderTrash();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Siguiente" }));
    await screen.findByText("Página 2 de 2");
    await user.click(screen.getByRole("checkbox", { name: "Seleccionar todos" }));
    await user.click(screen.getByRole("button", { name: "Restaurar seleccionados (2)" }));

    expect(await screen.findByText("Página 1 de 2")).toBeTruthy();
  });

  it("muestra la papelera vacía", async () => {
    getTrash.mockResolvedValue(data([]));
    renderTrash();

    expect(await screen.findByText("La papelera está vacía.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("button", { name: /Restaurar seleccionados/ })).toHaveProperty("disabled", true);
  });

  it("restaura un registro con su botón", async () => {
    restoreTrashItems.mockResolvedValue({ restored: [{ type: "customer", id: 6, label: "Test 2 Monotributo" }], failed: [] });
    getTrash.mockResolvedValueOnce(data(two)).mockResolvedValue(data([two[1]]));
    renderTrash();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Restaurar Cliente Test 2 Monotributo" }));

    await waitFor(() => expect(restoreTrashItems).toHaveBeenCalledWith([two[0]]));
    expect(await screen.findByText("1 registro restaurado.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Test 2 Monotributo")).toBeNull());
    expect(screen.getByText("1 - Sucursal")).toBeTruthy();
  });

  it("selecciona todos con el checkbox de la cabecera y restaura la selección", async () => {
    restoreTrashItems.mockResolvedValue({
      restored: [
        { type: "customer", id: 6, label: "Test 2 Monotributo" },
        { type: "sale_point", id: 3, label: "1 - Sucursal" },
      ],
      failed: [],
    });
    getTrash.mockResolvedValueOnce(data(two)).mockResolvedValue(data([]));
    renderTrash();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("checkbox", { name: "Seleccionar todos" }));
    expect(screen.getByRole("button", { name: "Restaurar seleccionados (2)" })).toHaveProperty("disabled", false);

    await user.click(screen.getByRole("button", { name: "Restaurar seleccionados (2)" }));

    await waitFor(() => expect(restoreTrashItems).toHaveBeenCalledTimes(1));
    expect(restoreTrashItems.mock.calls[0][0].map((i: TrashItem) => i.id)).toEqual([6, 3]);
    expect(await screen.findByText("2 registros restaurados.")).toBeTruthy();
    expect(await screen.findByText("La papelera está vacía.")).toBeTruthy();
  });

  it("el checkbox de la cabecera queda en estado parcial con una sola fila seleccionada", async () => {
    renderTrash();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("checkbox", { name: "Seleccionar Cliente Test 2 Monotributo" }));

    expect(screen.getByRole("checkbox", { name: "Seleccionar todos" }).getAttribute("data-state")).toBe("indeterminate");
    expect(screen.getByRole("button", { name: "Restaurar seleccionados (1)" })).toBeTruthy();
    expect(screen.getByText(/1 seleccionado/)).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "Seleccionar todos" }));
    expect(screen.getByRole("button", { name: "Restaurar seleccionados (2)" })).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "Seleccionar todos" }));
    expect(screen.getByRole("button", { name: /Restaurar seleccionados$/ })).toHaveProperty("disabled", true);
  });

  it("si alguno no se puede restaurar lo informa con el motivo y restaura los demás", async () => {
    restoreTrashItems.mockResolvedValue({
      restored: [{ type: "sale_point", id: 3, label: "1 - Sucursal" }],
      failed: [{ type: "customer", id: 6, message: "Ya existe un cliente activo con ese número de documento: no se puede restaurar este." }],
    });
    renderTrash();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("checkbox", { name: "Seleccionar todos" }));
    await user.click(screen.getByRole("button", { name: "Restaurar seleccionados (2)" }));

    expect(await screen.findByText("1 registro restaurado.")).toBeTruthy();
    expect(await screen.findByText(/Cliente Test 2 Monotributo: Ya existe un cliente activo/)).toBeTruthy();
  });

  it("muestra el error si falla la restauración o la carga", async () => {
    restoreTrashItems.mockRejectedValue(new Error("Ocurrió un error interno."));
    renderTrash();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: "Restaurar Cliente Test 2 Monotributo" }));
    expect(await screen.findByText("Ocurrió un error interno.")).toBeTruthy();
  });

  it("muestra el error si no se puede cargar la papelera", async () => {
    getTrash.mockRejectedValue(new Error("No hay conexión"));
    renderTrash();

    expect(await screen.findByText("No hay conexión")).toBeTruthy();
  });
});
