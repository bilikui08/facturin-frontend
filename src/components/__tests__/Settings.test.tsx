import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingDefinition } from "../../types/settings";
import Settings from "../Settings";

const getSettings = vi.fn();
const updateSettings = vi.fn();

vi.mock("../../services/settingsService", () => ({
  getSettings: (...a: unknown[]) => getSettings(...a),
  updateSettings: (...a: unknown[]) => updateSettings(...a),
}));

// Parámetro de ejemplo: la pantalla es genérica y se arma con lo que describe la API (hoy el registro tiene uno solo)
const trash: SettingDefinition = {
  key: "trash_retention_days",
  group: "Papelera de reciclaje",
  label: "Días que se conservan los registros eliminados",
  description: "Tiempo durante el cual podés restaurar lo que eliminaste.",
  unit: "días",
  default: 30,
  min: 1,
  max: 365,
  value: 30,
  is_default: true,
};
const recent: SettingDefinition = {
  key: "recent_invoices_count",
  group: "Facturar",
  label: "Comprobantes recientes que se muestran",
  description: "Cantidad de comprobantes de la lista de Facturar.",
  unit: "comprobantes",
  default: 10,
  min: 5,
  max: 50,
  value: 10,
  is_default: true,
};

describe("Configuración", () => {
  beforeEach(() => {
    getSettings.mockReset().mockResolvedValue([trash, recent]);
    updateSettings.mockReset().mockResolvedValue([trash, recent]);
  });

  it("arma la pantalla a partir de lo que describe la API, agrupada por sección", async () => {
    render(<Settings />);

    expect(await screen.findByText("Papelera de reciclaje")).toBeTruthy();
    expect(screen.getByText("Facturar")).toBeTruthy();
    expect((screen.getByLabelText(trash.label) as HTMLInputElement).value).toBe("30");
    expect((screen.getByLabelText(recent.label) as HTMLInputElement).value).toBe("10");
    expect(screen.getByText(trash.description)).toBeTruthy();
    expect(screen.getByText("Entre 1 y 365 días. Por defecto: 30.")).toBeTruthy();
    expect(screen.getByText("No hay cambios sin guardar.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toHaveProperty("disabled", true);
  });

  it("guarda solo lo que cambió y avisa", async () => {
    updateSettings.mockResolvedValue([{ ...trash, value: 90, is_default: false }, recent]);
    render(<Settings />);
    const user = userEvent.setup();

    const input = await screen.findByLabelText(trash.label);
    await user.clear(input);
    await user.type(input, "90");

    expect(screen.getByText("1 cambio sin guardar.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ trash_retention_days: 90 }));
    expect(await screen.findByText("Configuración guardada.")).toBeTruthy();
  });

  it("no envía valores fuera de rango y explica el rango", async () => {
    render(<Settings />);
    const user = userEvent.setup();

    const input = await screen.findByLabelText(trash.label);
    await user.clear(input);
    await user.type(input, "500");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("«Días que se conservan los registros eliminados» debe estar entre 1 y 365 días.")).toBeTruthy();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("no envía un valor vacío ni decimal", async () => {
    render(<Settings />);
    const user = userEvent.setup();

    const input = await screen.findByLabelText(recent.label);
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText(/debe estar entre 5 y 50 comprobantes/)).toBeTruthy();

    await user.type(input, "7.5");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("permite volver al valor por defecto de un parámetro", async () => {
    getSettings.mockResolvedValue([{ ...trash, value: 90, is_default: false }, recent]);
    render(<Settings />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Usar el valor por defecto (30)" }));

    expect((screen.getByLabelText(trash.label) as HTMLInputElement).value).toBe("30");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ trash_retention_days: 30 }));
  });

  it("muestra el error de la API al guardar", async () => {
    updateSettings.mockRejectedValue(new Error("«Comprobantes recientes que se muestran» debe estar entre 5 y 50 comprobantes."));
    render(<Settings />);
    const user = userEvent.setup();

    const input = await screen.findByLabelText(recent.label);
    await user.clear(input);
    await user.type(input, "20");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText(/debe estar entre 5 y 50 comprobantes/)).toBeTruthy();
  });

  it("muestra el error si no se puede cargar la configuración", async () => {
    getSettings.mockRejectedValue(new Error("No hay conexión"));
    render(<Settings />);

    expect(await screen.findByText("No hay conexión")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull();
  });
});
