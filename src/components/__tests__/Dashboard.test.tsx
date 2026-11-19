import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import Dashboard from "../Dashboard";

/** El enlace del menú lateral (la miga de pan de la cabecera también tiene rol de enlace). */
const menuLink = (name: string) =>
  screen.getAllByRole("link", { name }).find((link) => link.getAttribute("data-slot") === "sidebar-menu-button")!;

vi.mock("../CompanySwitcher", () => ({ default: () => null }));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard onLogout={vi.fn()} />}>
          <Route path="trash" element={<p>pantalla papelera</p>} />
          <Route path="settings" element={<p>pantalla configuración</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe("Menú lateral", () => {
  it("tiene Papelera en el menú y Configuración abajo, justo arriba de Cerrar sesión", () => {
    renderAt("/dashboard/trash");

    const nav = within(screen.getByRole("list", { name: "Navegación principal" }));
    expect(nav.getByRole("link", { name: "Papelera" }).getAttribute("href")).toBe("/dashboard/trash");
    expect(nav.queryByRole("link", { name: "Configuración" })).toBeNull();

    const settings = menuLink("Configuración");
    const logout = screen.getByRole("button", { name: "Cerrar sesión" });
    expect(settings.getAttribute("href")).toBe("/dashboard/settings");
    // Configuración queda antes que Cerrar sesión en el orden del documento
    expect(settings.compareDocumentPosition(logout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("el título y el menú reflejan la pantalla activa", () => {
    renderAt("/dashboard/settings");

    expect(screen.getByRole("heading", { level: 1, name: "Configuración" })).toBeTruthy();
    expect(menuLink("Configuración").getAttribute("data-active")).toBe("true");
    expect(screen.getByText("pantalla configuración")).toBeTruthy();
  });

  it("la papelera tiene su título", () => {
    renderAt("/dashboard/trash");

    expect(screen.getByRole("heading", { level: 1, name: "Papelera" })).toBeTruthy();
  });
});
