import { afterEach, describe, expect, it } from "vitest";
import { signIn, signOut } from "../../test/session";
import { NO_ACCESS, canSeeSection, firstAllowedSection, hasAny, readAccess } from "../access";

afterEach(() => {
  signOut();
  localStorage.clear();
});

describe("permisos leídos del token", () => {
  it("sin sesión no hay datos (y no restringe: la pantalla de login no los usa)", () => {
    expect(readAccess()).toEqual(NO_ACCESS);
  });

  it("lee la persona, la empresa y los permisos del token", () => {
    signIn({ userId: 7, organizationId: 42, permissions: ["sales.invoice.view", "sales.customer.view"] });

    expect(readAccess()).toEqual({ userId: 7, organizationId: 42, permissions: ["sales.invoice.view", "sales.customer.view"] });
  });

  it("un token anterior a las empresas (sin org) puede todo, como en el servidor", () => {
    signIn({ userId: 7 });

    const access = readAccess();
    expect(access.organizationId).toBeNull();
    expect(access.permissions).toBeNull();
    expect(hasAny(access, ["sales.invoice.annul"])).toBe(true);
  });

  it("con empresa pero sin lista de permisos no puede nada, y se descartan los que no son texto", () => {
    signIn({ organizationId: 1 });
    expect(readAccess().permissions).toEqual([]);
    expect(hasAny(readAccess(), ["sales.invoice.view"])).toBe(false);

    signIn({ organizationId: 1, permissions: ["sales.invoice.view", 5 as unknown as string, null as unknown as string] });
    expect(readAccess().permissions).toEqual(["sales.invoice.view"]);
  });

  it("alcanza con uno de los permisos pedidos; sin pedir ninguno, siempre", () => {
    signIn({ organizationId: 1, permissions: ["sales.invoice.view"] });
    const access = readAccess();

    expect(hasAny(access, ["sales.invoice.issue", "sales.invoice.view"])).toBe(true);
    expect(hasAny(access, ["sales.invoice.issue"])).toBe(false);
    expect(hasAny(access, [])).toBe(true);
  });

  it("decide qué secciones se ven y a cuál se entra", () => {
    signIn({ organizationId: 1, permissions: ["sales.invoice.view", "sales.customer.view"] });
    const viewer = readAccess();

    expect(canSeeSection(viewer, "invoices")).toBe(false); // Facturar exige emitir
    expect(canSeeSection(viewer, "invoices-list")).toBe(true);
    expect(canSeeSection(viewer, "customers")).toBe(true);
    expect(canSeeSection(viewer, "sale-points")).toBe(false);
    expect(canSeeSection(viewer, "trash")).toBe(false);
    expect(canSeeSection(viewer, "team")).toBe(false);
    expect(canSeeSection(viewer, "audit")).toBe(true);
    expect(canSeeSection(viewer, "settings")).toBe(true);
    expect(firstAllowedSection(viewer)).toBe("invoices-list");

    signIn({ organizationId: 1, permissions: ["sales.invoice.issue", "org.members.manage"] });
    expect(firstAllowedSection(readAccess())).toBe("invoices");
    expect(canSeeSection(readAccess(), "team")).toBe(true);
  });

  it("quien solo puede administrar clientes entra a Clientes, y sin nada entra a la configuración", () => {
    signIn({ organizationId: 1, permissions: ["sales.customer.manage"] });
    expect(firstAllowedSection(readAccess())).toBe("customers");

    signIn({ organizationId: 1, permissions: [] });
    expect(firstAllowedSection(readAccess())).toBe("audit");
  });

  it("un token ilegible no rompe nada", () => {
    localStorage.setItem("access_token", "no-es-un-jwt");

    expect(readAccess()).toEqual(NO_ACCESS);
  });
});
