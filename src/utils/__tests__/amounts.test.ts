import { describe, expect, it } from "vitest";
import { exceedsMaxAmount, invoiceTotal, limitDecimals, lineAmount, round2 } from "../amounts";

describe("round2", () => {
  it("redondea la mitad hacia arriba sin errores de punto flotante", () => {
    expect(round2(96960.625)).toBe(96960.63);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(12800920.625)).toBe(12800920.63);
  });

  it("deja intactos los valores con 2 decimales o menos", () => {
    expect(round2(25000)).toBe(25000);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(0)).toBe(0);
  });

  it("absorbe artefactos de punto flotante del precio", () => {
    expect(round2(Number("1257895.99999999999999"))).toBe(1257896);
  });
});

describe("limitDecimals", () => {
  it("no deja escribir más de 2 decimales", () => {
    expect(limitDecimals("38784.256")).toBe("38784.25");
    expect(limitDecimals("1257895.99999999999999")).toBe("1257895.99");
  });

  it("respeta lo que todavía está escribiendo", () => {
    expect(limitDecimals("")).toBe("");
    expect(limitDecimals("12")).toBe("12");
    expect(limitDecimals("12.")).toBe("12.");
    expect(limitDecimals("12.5")).toBe("12.5");
    expect(limitDecimals("12.50")).toBe("12.50");
  });
});

describe("importes del comprobante", () => {
  // Caso real de QA: ARCA rechazó con 10056 porque 2,5 × 38.784,25 = 96.960,625 (3 decimales).
  const qa = [
    { quantity: "5", price: "25000" },
    { quantity: "2.5", price: "38784.25" },
    { quantity: "10", price: "1257895.99999999999999" },
  ];

  it("redondea cada línea a 2 decimales", () => {
    expect(lineAmount(qa[0])).toBe(125000);
    expect(lineAmount(qa[1])).toBe(96960.63);
    expect(lineAmount(qa[2])).toBe(12578960);
  });

  it("el total suma las líneas redondeadas y tiene como máximo 2 decimales", () => {
    const total = invoiceTotal(qa);
    expect(total).toBe(12800920.63);
    expect(Math.round(total * 100) / 100).toBe(total);
  });

  it("redondea bien los casos de medio centavo que el punto flotante resuelve mal", () => {
    // 1,5 × 0,15 = 0,225 exacto; en punto flotante da 0.22499999999999998
    expect(lineAmount({ quantity: "1.5", price: "0.15" })).toBe(0.23);
    expect(invoiceTotal([{ quantity: "1", price: "0.1" }, { quantity: "1", price: "0.2" }])).toBe(0.3);
  });

  it("trata campos vacíos o inválidos como cero", () => {
    expect(lineAmount({ quantity: "", price: "" })).toBe(0);
    expect(invoiceTotal([{ quantity: "1", price: "" }])).toBe(0);
  });

  it("detecta importes de más de 13 dígitos enteros", () => {
    expect(exceedsMaxAmount(9_999_999_999_999.99)).toBe(false);
    expect(exceedsMaxAmount(10_000_000_000_000)).toBe(true);
  });
});
