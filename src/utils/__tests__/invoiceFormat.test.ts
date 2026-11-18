import { describe, expect, it } from "vitest";
import { formatMoney } from "../invoiceFormat";

// El espacio entre "$" y el número es un espacio duro: se normaliza para comparar
const plain = (text: string) => text.replace(/\s/g, " ");

describe("formatMoney (formato argentino)", () => {
  it("usa punto para los miles y coma para los decimales", () => {
    expect(plain(formatMoney(722501.13))).toBe("$ 722.501,13");
    expect(plain(formatMoney(12800920.63))).toBe("$ 12.800.920,63");
    expect(plain(formatMoney(1500.5))).toBe("$ 1.500,50");
  });

  it("acepta los importes como texto, tal como los devuelve la API", () => {
    expect(plain(formatMoney("139984.77"))).toBe("$ 139.984,77");
    expect(plain(formatMoney("90000.00"))).toBe("$ 90.000,00");
  });

  it("trata un valor vacío como cero", () => {
    expect(plain(formatMoney(null))).toBe("$ 0,00");
  });
});
