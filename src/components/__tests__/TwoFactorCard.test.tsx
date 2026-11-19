import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TwoFactorCard from "../TwoFactorCard";

const getTwoFactorStatus = vi.fn();
const startTwoFactorSetup = vi.fn();
const confirmTwoFactorSetup = vi.fn();
const disableTwoFactor = vi.fn();
const regenerateRecoveryCodes = vi.fn();

vi.mock("../../services/twoFactorService", () => ({
  getTwoFactorStatus: (...a: unknown[]) => getTwoFactorStatus(...a),
  startTwoFactorSetup: (...a: unknown[]) => startTwoFactorSetup(...a),
  confirmTwoFactorSetup: (...a: unknown[]) => confirmTwoFactorSetup(...a),
  disableTwoFactor: (...a: unknown[]) => disableTwoFactor(...a),
  regenerateRecoveryCodes: (...a: unknown[]) => regenerateRecoveryCodes(...a),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,QR") } }));

const active = { enabled: true, confirmed: true, recovery_codes_remaining: 8 };
const off = { enabled: false, confirmed: false, recovery_codes_remaining: 0 };

beforeEach(() => {
  getTwoFactorStatus.mockReset().mockResolvedValue(active);
  startTwoFactorSetup.mockReset().mockResolvedValue({ secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP" });
  confirmTwoFactorSetup.mockReset().mockResolvedValue({ ...active, recovery_codes: ["AAAAA-BBBBB", "CCCCC-DDDDD"] });
  disableTwoFactor.mockReset().mockResolvedValue(off);
  regenerateRecoveryCodes.mockReset().mockResolvedValue(["NNNNN-MMMMM"]);
});

const isOn = async () => (await screen.findByRole("switch", { name: "Verificación en dos pasos", hidden: true })).getAttribute("aria-checked") === "true";

describe("Seguridad de la cuenta", () => {
  it("muestra la verificación en dos pasos activa y cuántos códigos de recuperación quedan", async () => {
    render(<TwoFactorCard />);

    expect(await isOn()).toBe(true);
    expect(screen.getByText("Activa")).toBeTruthy();
    expect(screen.getByText("8")).toBeTruthy();
  });

  it("apagarla pide contraseña y código, y avisa que quedó solo con la contraseña", async () => {
    render(<TwoFactorCard />);
    const user = userEvent.setup();

    getTwoFactorStatus.mockResolvedValue(off);
    await user.click(await screen.findByRole("switch", { name: "Verificación en dos pasos" }));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByRole("button", { name: "Desactivar" }) as HTMLButtonElement).disabled).toBe(true);

    await user.type(within(dialog).getByLabelText("Contraseña"), "ClaveVieja1");
    await user.type(within(dialog).getByLabelText("Código"), "123456");
    await user.click(within(dialog).getByRole("button", { name: "Desactivar" }));

    expect(await screen.findByText(/Tu cuenta quedó protegida solo por la contraseña/)).toBeTruthy();
    expect(disableTwoFactor).toHaveBeenCalledWith("ClaveVieja1", "123456");
    await waitFor(async () => expect(await isOn()).toBe(false));
  });

  it("si la contraseña o el código no sirven, lo muestra en el diálogo y la cuenta sigue protegida", async () => {
    disableTwoFactor.mockRejectedValue(new Error("El código no es correcto o venció."));
    render(<TwoFactorCard />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("switch", { name: "Verificación en dos pasos" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Contraseña"), "ClaveVieja1");
    await user.type(within(dialog).getByLabelText("Código"), "000000");
    await user.click(within(dialog).getByRole("button", { name: "Desactivar" }));

    expect(await within(dialog).findByText("El código no es correcto o venció.")).toBeTruthy();
    expect(await isOn()).toBe(true);
  });

  it("volver a activarla muestra el QR, confirma con un código y entrega los códigos de recuperación", async () => {
    getTwoFactorStatus.mockResolvedValue(off);
    render(<TwoFactorCard />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("switch", { name: "Verificación en dos pasos" }));
    const dialog = await screen.findByRole("dialog");
    expect((await within(dialog).findByAltText(/Código QR/)).getAttribute("src")).toBe("data:image/png;base64,QR");

    getTwoFactorStatus.mockResolvedValue(active);
    await user.type(within(dialog).getByLabelText("Código de 6 dígitos"), "123456");
    await user.click(within(dialog).getByRole("button", { name: "Activar" }));

    expect(await within(dialog).findByText("AAAAA-BBBBB")).toBeTruthy();
    expect(confirmTwoFactorSetup).toHaveBeenCalledWith("123456");

    await user.click(within(dialog).getByLabelText("Ya guardé mis códigos de recuperación"));
    await user.click(within(dialog).getByRole("button", { name: "Listo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(async () => expect(await isOn()).toBe(true));
  });

  it("genera códigos de recuperación nuevos con un código vigente", async () => {
    render(<TwoFactorCard />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Generar códigos nuevos" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Código de 6 dígitos"), "123456");
    await user.click(within(dialog).getByRole("button", { name: "Generar" }));

    expect(await within(dialog).findByText("NNNNN-MMMMM")).toBeTruthy();
    expect(regenerateRecoveryCodes).toHaveBeenCalledWith("123456");
  });

  it("si no se puede consultar el estado, lo avisa", async () => {
    getTwoFactorStatus.mockRejectedValue(new Error("No se pudo cargar"));
    render(<TwoFactorCard />);

    expect(await screen.findByText("No se pudo cargar")).toBeTruthy();
  });
});
