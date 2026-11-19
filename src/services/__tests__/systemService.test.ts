import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_API_URL } from "../../config/api";
import { signIn, signOut } from "../../test/session";
import { getBranding, previewEmailTemplate, restoreEmailTemplate, saveEmailTemplate, sendTestEmail, updateSystemName } from "../systemService";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  signIn({ organizationId: 1, permissions: [] });
});

afterEach(() => {
  signOut();
  vi.unstubAllGlobals();
});

const draft = { subject: "s", heading: "h", body: "b", button_label: "x" };
const call = (n = 0) => ({ url: fetchMock.mock.calls[n][0], init: fetchMock.mock.calls[n][1] as RequestInit });

describe("marca pública", () => {
  it("devuelve el nombre del sistema sin enviar credenciales", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, data: { system_name: "Mi ERP" } }));

    expect(await getBranding()).toBe("Mi ERP");
    expect(call().url).toBe(`${AUTH_API_URL}/auth/branding`);
    expect(new Headers(call().init.headers).get("Authorization")).toBeNull();
  });

  it("si falla la consulta devuelve null en lugar de romper el login", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await getBranding()).toBeNull();

    fetchMock.mockResolvedValue(json(500, { success: false }));
    expect(await getBranding()).toBeNull();

    fetchMock.mockResolvedValue(json(200, { success: true, data: { system_name: "" } }));
    expect(await getBranding()).toBeNull();
  });
});

describe("ajustes y plantillas", () => {
  it("cambia el nombre (null vuelve al de por defecto)", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, data: { system_name: "Mi ERP" } }));

    await updateSystemName("Mi ERP");
    await updateSystemName(null);

    expect(call(0).init.method).toBe("PUT");
    expect(JSON.parse(call(0).init.body as string)).toEqual({ system_name: "Mi ERP" });
    expect(JSON.parse(call(1).init.body as string)).toEqual({ system_name: null });
  });

  it("guarda, restaura, previsualiza y prueba una plantilla por su clave", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, data: {} }));

    await saveEmailTemplate("invitation", draft);
    await restoreEmailTemplate("invitation");
    await previewEmailTemplate("invitation", draft, { invitador: "Juancito" });
    await sendTestEmail("invitation", draft, {});

    expect([0, 1, 2, 3].map((n) => `${call(n).init.method} ${call(n).url.replace(AUTH_API_URL, "")}`)).toEqual([
      "PUT /auth/admin/email-templates/invitation",
      "DELETE /auth/admin/email-templates/invitation",
      "POST /auth/admin/email-templates/invitation/preview",
      "POST /auth/admin/email-templates/invitation/test",
    ]);
    expect(JSON.parse(call(2).init.body as string)).toEqual({ ...draft, samples: { invitador: "Juancito" } });
  });

  it("un rechazo de validación llega como el primer mensaje útil", async () => {
    fetchMock.mockResolvedValue(json(422, { success: false, message: "Los datos enviados no son válidos.", errors: { body: ["No puede incluir enlaces ni HTML: el enlace del botón lo agrega el sistema."] } }));

    await expect(saveEmailTemplate("invitation", draft)).rejects.toThrow("No puede incluir enlaces ni HTML");
  });
});
