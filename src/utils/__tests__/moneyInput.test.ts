import { describe, expect, it } from "vitest";
import { todayInArgentina } from "../dates";
import { amountToCents, centsToAmount, filterAmountChars, parseAmount, parsePositiveAmount } from "../moneyInput";

describe("filterAmountChars", () => {
  it("deja solo dígitos, puntos y comas, sin interpretar nada", () => {
    expect(filterAmountChars("$ 1.234,50")).toBe("1.234,50");
    expect(filterAmountChars("abc12x")).toBe("12");
    expect(filterAmountChars("-5")).toBe("5");
    expect(filterAmountChars("")).toBe("");
  });

  it("tipear carácter por carácter no altera lo escrito (se interpreta recién al usarlo)", () => {
    let field = "";
    for (const key of "1.500,75") field = filterAmountChars(field + key);

    expect(field).toBe("1.500,75");
    expect(parseAmount(field)).toBe("1500.75");
  });
});

describe("parseAmount", () => {
  it("lee el formato argentino y el simple, siempre con 2 decimales", () => {
    const cases: Record<string, string> = {
      "1.500,75": "1500.75", "1500,75": "1500.75", "1500.75": "1500.75", "1.234.567,89": "1234567.89",
      "12,5": "12.50", "12.5": "12.50", "100": "100.00", "0,5": "0.50", "0.05": "0.05", "1500,": "1500.00", "007": "7.00",
      "1000.00": "1000.00", "9999999999999,99": "9999999999999.99",
    };
    for (const [typed, expected] of Object.entries(cases)) expect(parseAmount(typed), typed).toBe(expected);
  });

  it("un punto seguido de exactamente 3 dígitos es separador de miles; de 1 o 2, decimal", () => {
    expect(parseAmount("1.500")).toBe("1500.00");
    expect(parseAmount("1.234.567")).toBe("1234567.00");
    expect(parseAmount("1.50")).toBe("1.50");
    expect(parseAmount("1.5")).toBe("1.50");
  });

  it("no interpreta lo ambiguo o inválido (mejor avisar que adivinar con dinero)", () => {
    for (const bad of ["", " ", "abc", "0.123", "1,2,3", "12.34,5", "1.5,00", "1500.", "1,234", ".5", ",5", "1..5", "12345678901234", "1.2345"]) {
      expect(parseAmount(bad), bad).toBeNull();
    }
  });
});

describe("parsePositiveAmount", () => {
  it("devuelve el importe solo si es mayor a cero", () => {
    expect(parsePositiveAmount("0,01")).toBe("0.01");
    expect(parsePositiveAmount("1.500,75")).toBe("1500.75");
    expect(parsePositiveAmount("0")).toBeNull();
    expect(parsePositiveAmount("0,00")).toBeNull();
    expect(parsePositiveAmount("")).toBeNull();
    expect(parsePositiveAmount("abc")).toBeNull();
  });
});

describe("amountToCents / centsToAmount", () => {
  it("convierten sin errores de punto flotante", () => {
    expect(amountToCents("1234.50")).toBe(123450);
    expect(amountToCents("0.10") + amountToCents("0.20")).toBe(amountToCents("0.30"));
    expect(amountToCents("9999999999999.99")).toBe(999999999999999);
    expect(amountToCents("5")).toBe(500);
    expect(centsToAmount(123450)).toBe("1234.50");
    expect(centsToAmount(5)).toBe("0.05");
    expect(centsToAmount(0)).toBe("0.00");
  });

  it("los negativos conservan el signo (lo imputado de más se ve como faltante, no como saldo)", () => {
    expect(centsToAmount(-5)).toBe("-0.05");
    expect(centsToAmount(-123450)).toBe("-1234.50");
  });

  it("ida y vuelta", () => {
    for (const amount of ["0.01", "1.00", "99.99", "1000.00", "123456.78"]) expect(centsToAmount(amountToCents(amount))).toBe(amount);
  });
});

describe("todayInArgentina", () => {
  it("usa la fecha de Argentina aunque en UTC ya sea el día siguiente", () => {
    // 01:30 UTC del 20/11 son las 22:30 del 19/11 en Buenos Aires
    expect(todayInArgentina(new Date("2026-11-20T01:30:00Z"))).toBe("2026-11-19");
    expect(todayInArgentina(new Date("2026-11-20T12:00:00Z"))).toBe("2026-11-20");
  });
});
