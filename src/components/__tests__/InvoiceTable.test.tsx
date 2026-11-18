import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { InvoiceRow } from "../../types/invoice";
import InvoiceTable from "../InvoiceTable";

const row = (extra: Record<string, unknown>) =>
  ({
    id: 1,
    cbte_nro: 74,
    sale_point: { number: 1 },
    issue_date: "2026-11-18",
    afip_environment: "homologacion",
    cae: "86461089494558",
    cae_expiration: "2026-12-08",
    ...extra,
  }) as unknown as InvoiceRow;

describe("InvoiceTable", () => {
  it("muestra los totales en formato argentino (punto de miles, coma de decimales)", () => {
    render(
      <InvoiceTable
        invoices={[row({ id: 1, total: "722501.13" }), row({ id: 2, cbte_nro: 75, total: "90000.00" })]}
        customerName={() => "Cliente"}
      />,
    );

    expect(screen.getByText(/722\.501,13/)).toBeTruthy();
    expect(screen.getByText(/90\.000,00/)).toBeTruthy();
    expect(screen.queryByText("722501.13")).toBeNull();
  });

  it("muestra la nota de crédito en negativo", () => {
    render(
      <InvoiceTable
        invoices={[row({ id: 3, total: "25495.87", associated_invoice_id: 1 })]}
        customerName={() => "Cliente"}
      />,
    );

    expect(screen.getByText(/−.*25\.495,87/)).toBeTruthy();
  });

  it("muestra quién emitió cada comprobante", () => {
    render(
      <InvoiceTable
        invoices={[row({ id: 5, total: "100.00", created_by: 7 }), row({ id: 6, cbte_nro: 76, total: "50.00", created_by: null })]}
        customerName={() => "Cliente"}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Emitido por" })).toBeTruthy();
    expect(screen.getByText("Usuario 7")).toBeTruthy();
  });

  it("muestra un guion si el comprobante no tiene total", () => {
    render(<InvoiceTable invoices={[row({ id: 4, total: null })]} customerName={() => "Cliente"} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
