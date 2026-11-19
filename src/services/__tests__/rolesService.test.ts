import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_API_URL } from "../../config/api";
import { signIn, signOut } from "../../test/session";
import { createRole, deleteRole, getPermissionCatalog, getRoles, updateRole } from "../rolesService";

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

const call = (n = 0) => ({ url: String(fetchMock.mock.calls[n][0]).replace(AUTH_API_URL, ""), init: fetchMock.mock.calls[n][1] as RequestInit });

describe("roles", () => {
  it("usa los endpoints de roles y del catálogo de permisos", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, data: [] }));

    await getRoles();
    await getPermissionCatalog();
    await createRole({ name: "cajero", description: "Cajero", permissions: ["sales.invoice.view"] });
    await updateRole(7, { description: null, permissions: [] });
    await deleteRole(7);

    expect([0, 1, 2, 3, 4].map((n) => `${call(n).init.method} ${call(n).url}`)).toEqual([
      "GET /auth/roles",
      "GET /auth/permissions",
      "POST /auth/roles",
      "PUT /auth/roles/7",
      "DELETE /auth/roles/7",
    ]);
    expect(JSON.parse(call(2).init.body as string)).toEqual({ name: "cajero", description: "Cajero", permissions: ["sales.invoice.view"] });
  });

  it("un rechazo llega con el mensaje del servidor", async () => {
    fetchMock.mockResolvedValue(json(422, { success: false, message: "El rol «cajero» lo usan 2 personas en 1 empresa: cambiales el rol antes de borrarlo, o quedarían fuera de la empresa." }));

    await expect(deleteRole(4)).rejects.toThrow("lo usan 2 personas en 1 empresa");
  });

  it("un error de validación llega como el primer mensaje útil", async () => {
    fetchMock.mockResolvedValue(json(422, { success: false, message: "Los datos enviados no son válidos.", errors: { name: ["The name has already been taken."] } }));

    await expect(createRole({ name: "cajero", description: null, permissions: ["x"] })).rejects.toThrow("The name has already been taken.");
  });
});
