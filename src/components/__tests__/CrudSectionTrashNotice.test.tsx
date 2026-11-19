import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../services/apiClient";
import CrudSection from "../CrudSection";

const getResources = vi.fn();
const deleteResource = vi.fn();
const restoreResource = vi.fn();

vi.mock("../../services/crudService", () => ({
  getResources: (...a: unknown[]) => getResources(...a),
  getResource: vi.fn(),
  createResource: vi.fn(),
  updateResource: vi.fn(),
  deleteResource: (...a: unknown[]) => deleteResource(...a),
  restoreResource: (...a: unknown[]) => restoreResource(...a),
}));

const toTrash = { message: "Cliente eliminado" };

const renderSection = () =>
  render(
    <MemoryRouter>
      <CrudSection
        title="Clientes"
        singularName="Cliente"
        endpoint="/customers"
        fields={[{ name: "name", label: "Nombre", required: true }]}
      />
    </MemoryRouter>,
  );

const deleteFirst = async (user: ReturnType<typeof userEvent.setup>, name = "Ana Pérez") => {
  const row = (await screen.findAllByRole("row")).find((r) => within(r).queryByText(name));
  await user.click(within(row!).getByRole("button", { name: /Eliminar/ }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));
};

describe("CrudSection: aviso al mandar un registro a la papelera", () => {
  beforeEach(() => {
    getResources.mockReset().mockResolvedValue([{ id: 7, name: "Ana Pérez" }]);
    deleteResource.mockReset().mockResolvedValue(toTrash);
    restoreResource.mockReset().mockResolvedValue({ id: 7, name: "Ana Pérez" });
  });

  it("avisa que está en la papelera, sin plazo, y ofrece Deshacer y Ver papelera", async () => {
    renderSection();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await deleteFirst(user);

    expect(await screen.findByText(/«Ana Pérez» eliminado/)).toBeTruthy();
    expect(screen.getByText(/Está en la Papelera: podés restaurarlo desde ahí/)).toBeTruthy();
    expect(screen.queryByText(/\d+ días/)).toBeNull();
    expect(screen.getByRole("button", { name: /Deshacer/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver papelera" }).getAttribute("href")).toBe("/dashboard/trash");
    expect(screen.queryByText("Cliente eliminado correctamente.")).toBeNull();
  });

  it("al deshacer restaura el registro, recarga la lista y avisa", async () => {
    getResources.mockResolvedValueOnce([{ id: 7, name: "Ana Pérez" }]).mockResolvedValueOnce([]).mockResolvedValue([{ id: 7, name: "Ana Pérez" }]);
    renderSection();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await deleteFirst(user);
    await user.click(await screen.findByRole("button", { name: /Deshacer/ }));

    await waitFor(() => expect(restoreResource).toHaveBeenCalledWith("/customers", 7));
    expect(await screen.findByText("Cliente restaurado correctamente.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
    expect(await screen.findByText("Ana Pérez")).toBeTruthy();
  });

  it("cerrar el aviso no pierde nada: no restaura ni consulta, porque sigue en la papelera", async () => {
    renderSection();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await deleteFirst(user);
    await user.click(await screen.findByRole("button", { name: "Cerrar aviso" }));

    expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull();
    expect(restoreResource).not.toHaveBeenCalled();
  });

  it("si ya no se puede restaurar (por ejemplo, documento repetido) muestra el motivo y retira el aviso", async () => {
    restoreResource.mockRejectedValue(new ApiError("Ya existe un cliente activo con ese número de documento.", 422));
    renderSection();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await deleteFirst(user);
    await user.click(await screen.findByRole("button", { name: /Deshacer/ }));

    expect(await screen.findByText(/Ya existe un cliente activo/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: /Deshacer/ })).toBeNull());
  });

  it("ante un corte de red deja el aviso para reintentar", async () => {
    restoreResource.mockRejectedValueOnce(new Error("Failed to fetch"));
    renderSection();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await deleteFirst(user);
    await user.click(await screen.findByRole("button", { name: /Deshacer/ }));

    expect(await screen.findByText("Failed to fetch")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Deshacer/ })).toBeTruthy();
  });

  it("el diálogo de eliminar anticipa que se restaura desde la papelera", async () => {
    renderSection();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Eliminar/ }));

    expect(within(await screen.findByRole("alertdialog")).getByText(/Vas a poder restaurarlo desde la Papelera/)).toBeTruthy();
  });

  it("una segunda baja reemplaza el aviso de la anterior", async () => {
    getResources.mockResolvedValue([
      { id: 7, name: "Ana Pérez" },
      { id: 8, name: "Beto Gómez" },
    ]);
    renderSection();
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await deleteFirst(user, "Ana Pérez");
    await screen.findByText(/«Ana Pérez» eliminado/);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await deleteFirst(user, "Beto Gómez");

    expect(await screen.findByText(/«Beto Gómez» eliminado/)).toBeTruthy();
    expect(screen.queryByText(/«Ana Pérez» eliminado/)).toBeNull();
  });
});
