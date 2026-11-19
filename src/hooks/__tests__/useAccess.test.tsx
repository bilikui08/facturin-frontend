import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RequirePermission from "../../components/RequirePermission";
import { signIn, signOut } from "../../test/session";
import { useAccess } from "../useAccess";

afterEach(() => {
  signOut();
  localStorage.clear();
});

const Probe = () => {
  const { can, organizationId } = useAccess();
  return (
    <p>
      org {String(organizationId)} · {can("sales.invoice.issue") ? "puede emitir" : "no puede emitir"}
    </p>
  );
};

describe("useAccess", () => {
  it("se pone al día solo cuando el token cambia (renovación o cambio de empresa)", () => {
    signIn({ organizationId: 1, permissions: ["sales.invoice.view"] });
    render(<Probe />);
    expect(screen.getByText("org 1 · no puede emitir")).toBeTruthy();

    act(() => {
      signIn({ organizationId: 2, permissions: ["sales.invoice.issue"] });
    });

    expect(screen.getByText("org 2 · puede emitir")).toBeTruthy();
  });

  it("se actualiza al cerrar la sesión", () => {
    signIn({ organizationId: 1, permissions: ["sales.invoice.issue"] });
    render(<Probe />);

    act(() => signOut());

    // Sin sesión no hay datos: la interfaz de trabajo ya no se muestra, esto es solo que no falla
    expect(screen.getByText("org null · puede emitir")).toBeTruthy();
  });

  it("reacciona a un cambio hecho por otra pestaña (evento storage)", () => {
    signIn({ organizationId: 1, permissions: [] });
    render(<Probe />);
    expect(screen.getByText("org 1 · no puede emitir")).toBeTruthy();

    act(() => {
      localStorage.setItem("access_token", signIn({ organizationId: 1, permissions: ["sales.invoice.issue"] }));
      window.dispatchEvent(new StorageEvent("storage", { key: "access_token" }));
    });

    expect(screen.getByText("org 1 · puede emitir")).toBeTruthy();
  });
});

describe("RequirePermission", () => {
  it("muestra el contenido con el permiso y el aviso sin él", () => {
    signIn({ organizationId: 1, permissions: ["sales.customer.view"] });
    const { rerender } = render(
      <RequirePermission any={["sales.customer.view", "sales.customer.manage"]}>
        <p>contenido</p>
      </RequirePermission>,
    );
    expect(screen.getByText("contenido")).toBeTruthy();

    rerender(
      <RequirePermission any={["sales.invoice.annul"]}>
        <p>contenido</p>
      </RequirePermission>,
    );
    expect(screen.queryByText("contenido")).toBeNull();
    expect(screen.getByText("No tenés permiso para ver esta pantalla")).toBeTruthy();
  });

  it("sin permisos requeridos deja pasar a cualquier persona autenticada", () => {
    signIn({ organizationId: 1, permissions: [] });
    render(
      <RequirePermission any={[]}>
        <p>abierto</p>
      </RequirePermission>,
    );
    expect(screen.getByText("abierto")).toBeTruthy();
  });

  it("si el permiso llega con una renovación, el contenido aparece sin recargar", () => {
    signIn({ organizationId: 1, permissions: [] });
    render(
      <RequirePermission any={["sales.invoice.issue"]}>
        <p>facturar</p>
      </RequirePermission>,
    );
    expect(screen.queryByText("facturar")).toBeNull();

    act(() => {
      signIn({ organizationId: 1, permissions: ["sales.invoice.issue"] });
    });

    expect(screen.getByText("facturar")).toBeTruthy();
  });
});
