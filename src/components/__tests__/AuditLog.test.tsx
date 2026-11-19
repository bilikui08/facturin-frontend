import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditLogRow } from "../../types/audit";
import AuditLog from "../AuditLog";

const apiRequest = vi.fn();

vi.mock("../../services/apiClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const row = (extra: Partial<AuditLogRow>): AuditLogRow => ({
  id: 1,
  created_at: "2026-11-18T22:57:02.000000Z",
  user_id: 1,
  owner_id: 1,
  action: "customer.created",
  auditable_type: "customer",
  auditable_id: 3,
  changes: null,
  ip_address: "172.24.0.1",
  user_agent: "curl/7.81.0",
  ...extra,
});

const page = (data: AuditLogRow[], extra: Record<string, unknown> = {}) => ({
  data,
  current_page: 1,
  last_page: 1,
  per_page: 25,
  total: data.length,
  from: data.length ? 1 : null,
  to: data.length || null,
  ...extra,
});

const lastQuery = () => String(apiRequest.mock.calls.at(-1)?.[0]);

describe("AuditLog (auditoría)", () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it("lista quién hizo qué sobre qué registro", async () => {
    apiRequest.mockResolvedValue(
      page([
        row({ id: 2, action: "invoice.issued", auditable_type: "invoice", auditable_id: 9, user_id: 7 }),
        row({ id: 1, action: "customer.deleted", user_id: null }),
      ]),
    );
    render(<AuditLog />);

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Factura emitida")).toBeTruthy();
    expect(table.getByText("Usuario 7")).toBeTruthy();
    expect(table.getByText("Comprobante #9")).toBeTruthy();
    expect(table.getByText("Cliente dado de baja")).toBeTruthy();
    expect(table.getByText("Sistema")).toBeTruthy();
    expect(screen.getByText("2 registros")).toBeTruthy();
    expect(lastQuery()).toContain("/audit-logs?");
    expect(lastQuery()).toContain("per_page=25");
  });

  it("muestra el nombre guardado y, si no hay, el número de usuario", async () => {
    apiRequest.mockResolvedValue(
      page([
        row({ id: 2, user_id: 7, user_name: "Gustavo Luis" }),
        row({ id: 1, user_id: 9, user_name: null }),
      ]),
    );
    render(<AuditLog />);

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Gustavo Luis")).toBeTruthy();
    expect(table.getByText("Usuario 9")).toBeTruthy();
    expect(table.queryByText("Usuario 7")).toBeNull();
  });

  it("muestra el antes y el después de una edición", async () => {
    apiRequest.mockResolvedValue(
      page([
        row({
          action: "customer.updated",
          changes: { changes: { name: { old: "Cliente SA", new: "Cliente SRL" } } },
        }),
      ]),
    );
    render(<AuditLog />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Ver/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Cliente modificado")).toBeTruthy();
    expect(within(dialog).getByRole("columnheader", { name: "Antes" })).toBeTruthy();
    expect(within(dialog).getByText("Cliente SA")).toBeTruthy();
    expect(within(dialog).getByText("Cliente SRL")).toBeTruthy();
    expect(within(dialog).getByText(/172\.24\.0\.1/)).toBeTruthy();
  });

  it("muestra los datos de un comprobante emitido", async () => {
    apiRequest.mockResolvedValue(
      page([
        row({
          action: "invoice.issued",
          auditable_type: "invoice",
          changes: { voucher: "0001-00000011", total: "1000.00", cae: "86463181521312", customer: "Cliente SA" },
        }),
      ]),
    );
    render(<AuditLog />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Ver/ }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("0001-00000011")).toBeTruthy();
    expect(within(dialog).getByText("86463181521312")).toBeTruthy();
    expect(within(dialog).getByRole("columnheader", { name: "Valor" })).toBeTruthy();
  });

  it("una baja sin datos adicionales lo dice en lugar de mostrar una tabla vacía", async () => {
    apiRequest.mockResolvedValue(page([row({ action: "customer.deleted", changes: null })]));
    render(<AuditLog />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await user.click(await screen.findByRole("button", { name: /Ver/ }));

    expect(await screen.findByText("Esta acción no tiene datos adicionales.")).toBeTruthy();
  });

  it("filtra por tipo y acción y vuelve a la primera página", async () => {
    apiRequest.mockResolvedValue(page([row({})]));
    render(<AuditLog />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await screen.findByRole("table");

    await user.selectOptions(screen.getByLabelText("Registro"), "customer");
    await user.selectOptions(screen.getByLabelText("Acción"), "customer.deleted");
    await user.type(screen.getByLabelText("Usuario"), "Gustavo");
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    await waitFor(() => expect(lastQuery()).toContain("auditable_type=customer"));
    expect(lastQuery()).toContain("action=customer.deleted");
    expect(lastQuery()).toContain("user=Gustavo");
    expect(lastQuery()).toContain("page=1");
  });

  it("limpiar quita los filtros", async () => {
    apiRequest.mockResolvedValue(page([row({})]));
    render(<AuditLog />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await screen.findByRole("table");

    await user.selectOptions(screen.getByLabelText("Registro"), "invoice");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(lastQuery()).toContain("auditable_type=invoice"));

    await user.click(screen.getByRole("button", { name: "Limpiar" }));
    await waitFor(() => expect(lastQuery()).not.toContain("auditable_type"));
  });

  it("pagina", async () => {
    apiRequest.mockResolvedValue(page([row({})], { last_page: 3, total: 60 }));
    render(<AuditLog />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    await screen.findByText("Página 1 de 3");
    await user.click(screen.getByRole("button", { name: /Siguiente/ }));

    await waitFor(() => expect(lastQuery()).toContain("page=2"));
  });

  it("avisa si no hay actividad y muestra el error de la API", async () => {
    apiRequest.mockResolvedValueOnce(page([]));
    const { unmount } = render(<AuditLog />);
    expect(await screen.findByText("No hay actividad registrada con esos filtros.")).toBeTruthy();
    unmount();

    apiRequest.mockRejectedValueOnce(new Error("Ocurrió un error interno."));
    render(<AuditLog />);
    expect(await screen.findByText("Ocurrió un error interno.")).toBeTruthy();
  });
});
