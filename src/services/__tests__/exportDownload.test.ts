import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_API_URL, BILLING_API_URL } from "../../config/api";
import { signIn, signOut } from "../../test/session";
import { apiDownload, resetForbiddenRefreshForTests } from "../apiClient";
import { downloadExport } from "../exportService";

const xlsx = (headers: Record<string, string> = {}) =>
  new Response("PK-contenido", {
    status: 200,
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ...headers },
  });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let created: Blob[];
let clicked: { download: string; href: string }[];

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  resetForbiddenRefreshForTests();
  signIn({ organizationId: 1, permissions: ["sales.invoice.view"] });

  created = [];
  clicked = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    created.push(blob);
    return "blob:prueba";
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ download: this.download, href: this.href });
  });
});

afterEach(() => {
  signOut();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiDownload", () => {
  it("pide con la sesión, y lee el nombre del archivo y la cantidad de filas que informa el servidor", async () => {
    fetchMock.mockResolvedValue(xlsx({ "Content-Disposition": `attachment; filename="comprobantes-2026-11-19.xlsx"; filename*=UTF-8''comprobantes-2026-11-19.xlsx`, "X-Export-Rows": "143" }));

    const file = await apiDownload("/invoices/export?scope=all");

    expect(fetchMock.mock.calls[0][0]).toBe(`${BILLING_API_URL}/invoices/export?scope=all`);
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Authorization")).toMatch(/^Bearer /);
    expect(file.fileName).toBe("comprobantes-2026-11-19.xlsx");
    expect(file.rows).toBe(143);
    expect(await file.blob.text()).toBe("PK-contenido");
  });

  it("entiende nombres con tildes (filename*) y sin comillas", async () => {
    fetchMock.mockResolvedValueOnce(xlsx({ "Content-Disposition": `attachment; filename="facturacion.xlsx"; filename*=UTF-8''facturaci%C3%B3n.xlsx` }));
    expect((await apiDownload("/x")).fileName).toBe("facturación.xlsx");

    fetchMock.mockResolvedValueOnce(xlsx({ "Content-Disposition": "attachment; filename=clientes.csv" }));
    expect((await apiDownload("/x")).fileName).toBe("clientes.csv");
  });

  it("sin cabeceras no inventa nada", async () => {
    fetchMock.mockResolvedValue(xlsx());

    const file = await apiDownload("/x");

    expect(file.fileName).toBeNull();
    expect(file.rows).toBeNull();
  });

  it("si el servidor rechaza, lanza con SU mensaje (por ejemplo, demasiadas filas)", async () => {
    fetchMock.mockResolvedValue(json(422, { success: false, code: "EXPORT_TOO_LARGE", message: "La exportación tiene 60.000 filas y el máximo es 50.000. Acotá los filtros y volvé a intentar." }));

    await expect(apiDownload("/invoices/export?scope=all")).rejects.toMatchObject({ status: 422, message: expect.stringContaining("Acotá los filtros") });
  });

  it("un 403 informa el permiso y no baja nada", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === `${AUTH_API_URL}/auth/refresh` ? json(401, { success: false }) : json(403, { success: false, message: "No tenés permiso para realizar esta acción." }),
    );

    await expect(apiDownload("/customers/export")).rejects.toMatchObject({ status: 403, message: "No tenés permiso para realizar esta acción." });
  });

  it("si el token venció renueva la sesión una vez y repite el pedido", async () => {
    let first = true;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === `${AUTH_API_URL}/auth/refresh`) {
        return json(200, { success: true, data: { tokens: { token_type: "Bearer", expires_in: 900, access_token: signInToken(), refresh_token: "ref-2" } } });
      }
      if (first) {
        first = false;
        return json(401, { success: false, message: "No autenticado." });
      }
      return xlsx({ "X-Export-Rows": "3" });
    });

    const file = await apiDownload("/invoices/export?scope=all");

    expect(file.rows).toBe(3);
    expect(fetchMock.mock.calls.filter((c) => c[0] === `${BILLING_API_URL}/invoices/export?scope=all`)).toHaveLength(2);
  });
});

const signInToken = (): string => {
  const b64 = (v: object) => btoa(JSON.stringify(v)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${b64({ alg: "RS256" })}.${b64({ sub: "7", org: 1, permissions: ["sales.invoice.view"], jti: "j", exp: Math.floor(Date.now() / 1000) + 900 })}.firma`;
};

describe("downloadExport", () => {
  it("manda el alcance y los filtros como parámetros y descarga el archivo con el nombre del servidor", async () => {
    fetchMock.mockResolvedValue(xlsx({ "Content-Disposition": `attachment; filename="comprobantes-2026-11-19.xlsx"`, "X-Export-Rows": "10" }));

    const result = await downloadExport("/invoices/export", "page", { customer: "Pérez", page: "2", per_page: "10" });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname.endsWith("/invoices/export")).toBe(true);
    expect(Object.fromEntries(url.searchParams)).toEqual({ customer: "Pérez", page: "2", per_page: "10", scope: "page" });
    expect(result).toEqual({ fileName: "comprobantes-2026-11-19.xlsx", rows: 10 });
    expect(clicked).toEqual([{ download: "comprobantes-2026-11-19.xlsx", href: "blob:prueba" }]);
    expect(await created[0].text()).toBe("PK-contenido");
  });

  it("el alcance siempre es el pedido, aunque los filtros traigan otro `scope`", async () => {
    fetchMock.mockResolvedValue(xlsx());

    await downloadExport("/invoices/export", "all", { scope: "page" });

    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("scope")).toBe("all");
  });

  it("sin nombre del servidor usa uno razonable", async () => {
    fetchMock.mockResolvedValue(xlsx());

    expect((await downloadExport("/customers/export", "all")).fileName).toBe("exportacion.xlsx");
  });

  it("si falla no descarga nada", async () => {
    fetchMock.mockResolvedValue(json(422, { success: false, message: "demasiado grande" }));

    await expect(downloadExport("/invoices/export", "all")).rejects.toThrow("demasiado grande");
    expect(clicked).toHaveLength(0);
  });
});
