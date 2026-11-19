import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CompanySwitcher from "../CompanySwitcher";

const getMyOrganizations = vi.fn();
const switchOrganization = vi.fn();
const reloadAt = vi.fn();

vi.mock("../../services/organizationService", () => ({
  getMyOrganizations: (...a: unknown[]) => getMyOrganizations(...a),
  switchOrganization: (...a: unknown[]) => switchOrganization(...a),
}));
vi.mock("../../utils/navigation", () => ({ reloadAt: (...a: unknown[]) => reloadAt(...a) }));

const two = { current: 1, organizations: [{ id: 1, name: "A SA" }, { id: 2, name: "B SRL" }] };

describe("Selector de empresa", () => {
  beforeEach(() => {
    getMyOrganizations.mockReset().mockResolvedValue(two);
    switchOrganization.mockReset().mockResolvedValue(undefined);
    reloadAt.mockReset();
  });

  it("con una sola empresa es solo un rótulo, sin selector", async () => {
    getMyOrganizations.mockResolvedValue({ current: 1, organizations: [{ id: 1, name: "Mi Empresa" }] });
    render(<CompanySwitcher />);

    expect(await screen.findByText("Mi Empresa")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("con varias muestra un selector con la actual elegida", async () => {
    render(<CompanySwitcher />);

    const select = (await screen.findByLabelText("Empresa")) as HTMLSelectElement;
    expect(select.value).toBe("1");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["A SA", "B SRL"]);
  });

  it("al elegir otra cambia de empresa y recarga la aplicación (sin datos de la anterior); entra a la primera pantalla permitida", async () => {
    render(<CompanySwitcher />);
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText("Empresa"), "2");

    await waitFor(() => expect(reloadAt).toHaveBeenCalledWith("/"));
    expect(switchOrganization).toHaveBeenCalledWith(2);
  });

  it("si el cambio falla muestra el motivo, no recarga y deja volver a intentar", async () => {
    switchOrganization.mockRejectedValue(new Error("Ya no pertenecés a la empresa de esta sesión: iniciá sesión de nuevo."));
    render(<CompanySwitcher />);
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText("Empresa"), "2");

    expect(await screen.findByText(/Ya no pertenecés a la empresa/)).toBeTruthy();
    expect(reloadAt).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Empresa") as HTMLSelectElement).disabled).toBe(false);
  });

  it("elegir la empresa actual no hace nada", async () => {
    render(<CompanySwitcher />);
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText("Empresa"), "1");

    expect(switchOrganization).not.toHaveBeenCalled();
  });

  it("en una sesión anterior a las empresas (actual desconocida) pide elegir una", async () => {
    getMyOrganizations.mockResolvedValue({ current: null, organizations: two.organizations });
    render(<CompanySwitcher />);

    const select = (await screen.findByLabelText("Empresa")) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByRole("option", { name: "Elegí una empresa" })).toBeTruthy();
  });

  it("si no se pueden cargar las empresas no muestra nada (la pantalla funciona igual)", async () => {
    getMyOrganizations.mockRejectedValue(new Error("sin conexión"));
    const { container } = render(<CompanySwitcher />);

    await waitFor(() => expect(getMyOrganizations).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });
});
