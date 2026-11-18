import { describe, expect, it } from "vitest";
import {
  auditActionLabel,
  auditActionTone,
  auditDetailRows,
  auditRecordLabel,
  auditUserLabel,
  formatDateTime,
} from "../auditFormat";

describe("auditFormat", () => {
  it("traduce las acciones y deja pasar las desconocidas", () => {
    expect(auditActionLabel("invoice.issued")).toBe("Factura emitida");
    expect(auditActionLabel("customer.deleted")).toBe("Cliente dado de baja");
    expect(auditActionLabel("otra.cosa")).toBe("otra.cosa");
  });

  it("marca con color lo destructivo y lo que se crea", () => {
    expect(auditActionTone("invoice.annulled")).toBe("destructive");
    expect(auditActionTone("customer.created")).toBe("success");
    expect(auditActionTone("customer.updated")).toBe("secondary");
    expect(auditActionTone("desconocida")).toBe("secondary");
  });

  it("describe el registro y el usuario", () => {
    expect(auditRecordLabel({ auditable_type: "customer", auditable_id: 3 })).toBe("Cliente #3");
    expect(auditRecordLabel({ auditable_type: "invoice", auditable_id: null })).toBe("Comprobante");
    expect(auditUserLabel(7)).toBe("Usuario 7");
    expect(auditUserLabel(null)).toBe("Sistema");
  });

  it("formatea la fecha y hora local", () => {
    expect(formatDateTime("2026-11-18T22:57:02.000000Z")).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/);
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("no es una fecha")).toBe("—");
  });

  it("arma las filas del detalle de una edición con el antes y el después", () => {
    const rows = auditDetailRows({ changes: { name: { old: "Cliente SA", new: "Cliente SRL" }, address: { old: null, new: "Calle 1" } } });

    expect(rows).toEqual([
      { field: "Nombre", old: "Cliente SA", new: "Cliente SRL" },
      { field: "Domicilio", old: "—", new: "Calle 1" },
    ]);
  });

  it("arma las filas de un alta y de un comprobante", () => {
    expect(auditDetailRows({ values: { name: "Cliente SA", address: null } })).toEqual([
      { field: "Nombre", value: "Cliente SA" },
      { field: "Domicilio", value: "—" },
    ]);

    const invoice = auditDetailRows({ voucher: "0001-00000011", total: "1000.00", cae: "86463181521312" });
    expect(invoice).toEqual([
      { field: "Comprobante", value: "0001-00000011" },
      { field: "Total", value: "1000.00" },
      { field: "CAE", value: "86463181521312" },
    ]);
  });

  it("no falla sin detalle (bajas lógicas y restauraciones)", () => {
    expect(auditDetailRows(null)).toEqual([]);
  });
});
