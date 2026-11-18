import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CrudSection from "../CrudSection";

const getResources = vi.fn();
const deleteResource = vi.fn();

vi.mock("../../services/crudService", () => ({
  getResources: (...a: unknown[]) => getResources(...a),
  getResource: vi.fn(),
  createResource: vi.fn(),
  updateResource: vi.fn(),
  deleteResource: (...a: unknown[]) => deleteResource(...a),
}));

const renderSection = () =>
  render(
    <CrudSection
      title="Clientes"
      singularName="Cliente"
      endpoint="/customers"
      fields={[{ name: "name", label: "Nombre", required: true }]}
    />,
  );

describe("CrudSection", () => {
  beforeEach(() => {
    getResources.mockReset().mockResolvedValue([{ id: 7, name: "Ana Pérez" }]);
    deleteResource.mockReset().mockResolvedValue(undefined);
  });

  it("lista los registros", async () => {
    renderSection();
    expect(await screen.findByText("Ana Pérez")).toBeTruthy();
  });

  it("pide confirmación antes de eliminar y no elimina si se cancela", async () => {
    renderSection();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(await screen.findByRole("button", { name: /Eliminar/ }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("¿Eliminar cliente?")).toBeTruthy();
    expect(within(dialog).getByText(/los comprobantes ya emitidos con este cliente se conservan/)).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(deleteResource).not.toHaveBeenCalled();
  });

  it("elimina el registro al confirmar", async () => {
    renderSection();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(await screen.findByRole("button", { name: /Eliminar/ }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(deleteResource).toHaveBeenCalledWith("/customers", 7));
    expect(await screen.findByText("Cliente eliminado correctamente.")).toBeTruthy();
  });
});
