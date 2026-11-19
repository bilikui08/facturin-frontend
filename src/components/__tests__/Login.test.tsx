import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Login from "../Login";

const login = vi.fn();
const selectOrganization = vi.fn();
const getBranding = vi.fn();
const twoFactorSetup = vi.fn();
const twoFactorVerify = vi.fn();
const twoFactorConfirm = vi.fn();

vi.mock("../../services/systemService", () => ({ getBranding: (...args: unknown[]) => getBranding(...args) }));

vi.mock("../../services/authService", () => ({
  login: (...args: unknown[]) => login(...args),
  selectOrganization: (...args: unknown[]) => selectOrganization(...args),
  twoFactorSetup: (...args: unknown[]) => twoFactorSetup(...args),
  twoFactorVerify: (...args: unknown[]) => twoFactorVerify(...args),
  twoFactorConfirm: (...args: unknown[]) => twoFactorConfirm(...args),
}));

vi.mock("../Recaptcha", async () => import("../../test/recaptchaMock"));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,QR") } }));

describe("Login", () => {
  beforeEach(() => {
    login.mockReset();
    selectOrganization.mockReset();
    twoFactorSetup.mockReset();
    twoFactorVerify.mockReset();
    twoFactorConfirm.mockReset();
    getBranding.mockReset().mockResolvedValue(null);
  });

  it("ofrece recuperar la contraseña", () => {
    render(<Login onLoginSuccess={vi.fn()} />);

    expect(screen.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).getAttribute("href")).toBe("/forgot-password");
  });

  it("muestra el nombre del sistema configurado, no uno fijo", async () => {
    getBranding.mockResolvedValue("Mi ERP");
    render(<Login onLoginSuccess={vi.fn()} />);

    expect(await screen.findByText("Mi ERP")).toBeTruthy();
    expect(screen.getByText("Panel de Mi ERP")).toBeTruthy();
    expect(screen.queryByText("Facturín")).toBeNull();
  });

  it("si no se puede consultar el nombre igual se puede ingresar", async () => {
    render(<Login onLoginSuccess={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Ingresar" })).toBeTruthy();
    expect(screen.queryByText(/Panel de/)).toBeNull();
  });

  it("envía email, contraseña y la opción recordarme", async () => {
    login.mockResolvedValue({ kind: "signed-in" });
    const onLoginSuccess = vi.fn();
    render(<Login onLoginSuccess={onLoginSuccess} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "yo@ejemplo.com");
    await user.type(screen.getByLabelText("Contraseña"), "secreta123");
    await user.click(screen.getByLabelText("Recordarme"));
    await user.click(screen.getByLabelText("No soy un robot"));
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
    expect(login).toHaveBeenCalledWith("yo@ejemplo.com", "secreta123", true, "captcha-ok");
  });

  it("muestra el error y no ingresa si las credenciales son inválidas", async () => {
    login.mockRejectedValue(new Error("Las credenciales ingresadas no son válidas."));
    const onLoginSuccess = vi.fn();
    render(<Login onLoginSuccess={onLoginSuccess} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Email"), "yo@ejemplo.com");
    await user.type(screen.getByLabelText("Contraseña"), "mala");
    await user.click(screen.getByLabelText("No soy un robot"));
    await user.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText("Las credenciales ingresadas no son válidas.")).toBeTruthy();
    expect(onLoginSuccess).not.toHaveBeenCalled();
  });

  describe("con varias empresas", () => {
    const pending = {
      kind: "select-organization",
      selectionToken: "sel-1",
      organizations: [{ id: 1, name: "A SA" }, { id: 2, name: "B SRL" }],
    };

    const submitCredentials = async (user: ReturnType<typeof userEvent.setup>, remember = false) => {
      await user.type(screen.getByLabelText("Email"), "yo@ejemplo.com");
      await user.type(screen.getByLabelText("Contraseña"), "secreta123");
      if (remember) await user.click(screen.getByLabelText("Recordarme"));
      await user.click(screen.getByLabelText("No soy un robot"));
    await user.click(screen.getByRole("button", { name: "Ingresar" }));
    };

    it("después de validar las credenciales pide elegir la empresa y no ingresa todavía", async () => {
      login.mockResolvedValue(pending);
      const onLoginSuccess = vi.fn();
      render(<Login onLoginSuccess={onLoginSuccess} />);

      await submitCredentials(userEvent.setup());

      expect(await screen.findByText("Elegí la empresa")).toBeTruthy();
      const list = within(screen.getByRole("list", { name: "Empresas" }));
      expect(list.getByRole("button", { name: "A SA" })).toBeTruthy();
      expect(list.getByRole("button", { name: "B SRL" })).toBeTruthy();
      expect(screen.queryByLabelText("Contraseña")).toBeNull();
      expect(onLoginSuccess).not.toHaveBeenCalled();
    });

    it("elegir una empresa ingresa con el permiso temporal y la opción recordarme", async () => {
      login.mockResolvedValue(pending);
      selectOrganization.mockResolvedValue(undefined);
      const onLoginSuccess = vi.fn();
      render(<Login onLoginSuccess={onLoginSuccess} />);
      const user = userEvent.setup();

      await submitCredentials(user, true);
      await user.click(await screen.findByRole("button", { name: "B SRL" }));

      await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
      expect(selectOrganization).toHaveBeenCalledWith("sel-1", 2, true);
    });

    it("si el permiso venció muestra el motivo y permite volver a las credenciales", async () => {
      login.mockResolvedValue(pending);
      selectOrganization.mockRejectedValue(new Error("La selección de empresa venció: volvé a iniciar sesión."));
      const onLoginSuccess = vi.fn();
      render(<Login onLoginSuccess={onLoginSuccess} />);
      const user = userEvent.setup();

      await submitCredentials(user);
      await user.click(await screen.findByRole("button", { name: "A SA" }));

      expect(await screen.findByText("La selección de empresa venció: volvé a iniciar sesión.")).toBeTruthy();
      expect(onLoginSuccess).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Volver" }));
      expect(screen.getByLabelText("Contraseña")).toHaveProperty("value", "");
      expect(screen.queryByText("La selección de empresa venció: volvé a iniciar sesión.")).toBeNull();
    });
  });

  describe("captcha", () => {
    it("no deja ingresar hasta completar el captcha", async () => {
      render(<Login onLoginSuccess={vi.fn()} />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText("Email"), "yo@ejemplo.com");
      await user.type(screen.getByLabelText("Contraseña"), "secreta123");
      expect((screen.getByRole("button", { name: "Ingresar" }) as HTMLButtonElement).disabled).toBe(true);

      await user.click(screen.getByLabelText("No soy un robot"));
      expect((screen.getByRole("button", { name: "Ingresar" }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("tras un intento fallido hay que completar el captcha de nuevo (cada respuesta vale una vez)", async () => {
      login.mockRejectedValue(new Error("Las credenciales ingresadas no son válidas."));
      render(<Login onLoginSuccess={vi.fn()} />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText("Email"), "yo@ejemplo.com");
      await user.type(screen.getByLabelText("Contraseña"), "mala");
      await user.click(screen.getByLabelText("No soy un robot"));
      await user.click(screen.getByRole("button", { name: "Ingresar" }));

      expect(await screen.findByText("Las credenciales ingresadas no son válidas.")).toBeTruthy();
      await waitFor(() => expect((screen.getByRole("button", { name: "Ingresar" }) as HTMLButtonElement).disabled).toBe(true));
    });
  });

  describe("verificación en dos pasos", () => {
    const credentials = async (user: ReturnType<typeof userEvent.setup>, remember = false) => {
      await user.type(screen.getByLabelText("Email"), "yo@ejemplo.com");
      await user.type(screen.getByLabelText("Contraseña"), "secreta123");
      if (remember) await user.click(screen.getByLabelText("Recordarme"));
      await user.click(screen.getByLabelText("No soy un robot"));
      await user.click(screen.getByRole("button", { name: "Ingresar" }));
    };

    it("después de la contraseña pide el código y con el código correcto ingresa", async () => {
      login.mockResolvedValue({ kind: "two-factor", challengeToken: "c1", mode: "verify" });
      twoFactorVerify.mockResolvedValue({ kind: "signed-in" });
      const onLoginSuccess = vi.fn();
      render(<Login onLoginSuccess={onLoginSuccess} />);
      const user = userEvent.setup();

      await credentials(user, true);
      expect(await screen.findByText("Verificación en dos pasos")).toBeTruthy();
      expect(onLoginSuccess).not.toHaveBeenCalled();

      await user.type(screen.getByLabelText("Código de verificación"), "123456");
      await user.click(screen.getByRole("button", { name: "Verificar" }));

      await waitFor(() => expect(onLoginSuccess).toHaveBeenCalled());
      expect(twoFactorVerify).toHaveBeenCalledWith("c1", "123456", true);
    });

    it("con un código incorrecto muestra el motivo, vacía el campo y no ingresa", async () => {
      login.mockResolvedValue({ kind: "two-factor", challengeToken: "c1", mode: "verify" });
      twoFactorVerify.mockRejectedValue(new Error("El código no es correcto o venció."));
      const onLoginSuccess = vi.fn();
      render(<Login onLoginSuccess={onLoginSuccess} />);
      const user = userEvent.setup();

      await credentials(user);
      await user.type(await screen.findByLabelText("Código de verificación"), "000000");
      await user.click(screen.getByRole("button", { name: "Verificar" }));

      expect(await screen.findByText("El código no es correcto o venció.")).toBeTruthy();
      expect((screen.getByLabelText("Código de verificación") as HTMLInputElement).value).toBe("");
      expect(onLoginSuccess).not.toHaveBeenCalled();
    });

    it("permite usar un código de recuperación", async () => {
      login.mockResolvedValue({ kind: "two-factor", challengeToken: "c1", mode: "verify" });
      twoFactorVerify.mockResolvedValue({ kind: "signed-in" });
      render(<Login onLoginSuccess={vi.fn()} />);
      const user = userEvent.setup();

      await credentials(user);
      await user.click(await screen.findByRole("button", { name: "Usar un código de recuperación" }));
      await user.type(screen.getByLabelText("Código de recuperación"), "ABCDE-FGHJK");
      await user.click(screen.getByRole("button", { name: "Verificar" }));

      await waitFor(() => expect(twoFactorVerify).toHaveBeenCalledWith("c1", "ABCDE-FGHJK", false));
    });

    it("con varias empresas, después del código sigue la elección de empresa", async () => {
      login.mockResolvedValue({ kind: "two-factor", challengeToken: "c1", mode: "verify" });
      twoFactorVerify.mockResolvedValue({ kind: "select-organization", selectionToken: "sel-1", organizations: [{ id: 1, name: "Empresa A" }, { id: 2, name: "Empresa B" }] });
      render(<Login onLoginSuccess={vi.fn()} />);
      const user = userEvent.setup();

      await credentials(user);
      await user.type(await screen.findByLabelText("Código de verificación"), "123456");
      await user.click(screen.getByRole("button", { name: "Verificar" }));

      expect(await screen.findByText("Elegí la empresa")).toBeTruthy();
    });

    it("volver regresa a usuario y contraseña", async () => {
      login.mockResolvedValue({ kind: "two-factor", challengeToken: "c1", mode: "verify" });
      render(<Login onLoginSuccess={vi.fn()} />);
      const user = userEvent.setup();

      await credentials(user);
      await user.click(await screen.findByRole("button", { name: "Volver" }));

      expect(await screen.findByRole("button", { name: "Ingresar" })).toBeTruthy();
    });

    it("primer ingreso: muestra el QR y la clave, confirma con el primer código y no entra hasta guardar los códigos de recuperación", async () => {
      login.mockResolvedValue({ kind: "two-factor", challengeToken: "c1", mode: "setup" });
      twoFactorSetup.mockResolvedValue({ secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/Mi%20ERP%3Ayo%40ejemplo.com?secret=JBSWY3DPEHPK3PXP" });
      const finish = vi.fn().mockReturnValue({ kind: "signed-in" });
      twoFactorConfirm.mockResolvedValue({ recoveryCodes: ["AAAAA-BBBBB", "CCCCC-DDDDD"], finish });
      const onLoginSuccess = vi.fn();
      render(<Login onLoginSuccess={onLoginSuccess} />);
      const user = userEvent.setup();

      await credentials(user);
      expect(await screen.findByText("Activá la verificación en dos pasos")).toBeTruthy();
      expect((await screen.findByAltText(/Código QR/)).getAttribute("src")).toBe("data:image/png;base64,QR");
      expect((screen.getByLabelText(/Escribí esta clave/) as HTMLInputElement).value).toBe("JBSW Y3DP EHPK 3PXP");
      expect((screen.getByRole("button", { name: "Activar y continuar" }) as HTMLButtonElement).disabled).toBe(true);

      await user.type(screen.getByLabelText("Código de 6 dígitos"), "123 456");
      await user.click(screen.getByRole("button", { name: "Activar y continuar" }));

      expect(await screen.findByText("AAAAA-BBBBB")).toBeTruthy();
      expect(twoFactorConfirm).toHaveBeenCalledWith("c1", "123456", false);
      expect(finish).not.toHaveBeenCalled();
      expect(onLoginSuccess).not.toHaveBeenCalled();
      expect((screen.getByRole("button", { name: "Continuar" }) as HTMLButtonElement).disabled).toBe(true);

      await user.click(screen.getByLabelText("Ya guardé mis códigos de recuperación"));
      await user.click(screen.getByRole("button", { name: "Continuar" }));

      expect(finish).toHaveBeenCalled();
      expect(onLoginSuccess).toHaveBeenCalled();
    });

    it("si el código de la configuración es incorrecto lo avisa y se puede reintentar", async () => {
      login.mockResolvedValue({ kind: "two-factor", challengeToken: "c1", mode: "setup" });
      twoFactorSetup.mockResolvedValue({ secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP" });
      twoFactorConfirm.mockRejectedValue(new Error("El código no es correcto o venció."));
      render(<Login onLoginSuccess={vi.fn()} />);
      const user = userEvent.setup();

      await credentials(user);
      await user.type(await screen.findByLabelText("Código de 6 dígitos"), "000000");
      await user.click(screen.getByRole("button", { name: "Activar y continuar" }));

      expect(await screen.findByText("El código no es correcto o venció.")).toBeTruthy();
      expect(screen.queryByText("Verificación en dos pasos activada")).toBeNull();
    });
  });
});
