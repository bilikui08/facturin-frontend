import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useIdempotencyKey } from "../useIdempotencyKey";

describe("useIdempotencyKey", () => {
  it("los mismos datos reenviados llevan la misma clave (doble click, reintento tras un corte)", () => {
    const { result } = renderHook(() => useIdempotencyKey());

    const first = result.current.keyFor("cobro-100");

    expect(first).toMatch(/\S{8,}/);
    expect(result.current.keyFor("cobro-100")).toBe(first);
    expect(result.current.keyFor("cobro-100")).toBe(first);
  });

  it("datos distintos son otro intento: clave nueva", () => {
    const { result } = renderHook(() => useIdempotencyKey());

    const first = result.current.keyFor("cobro-100");
    const second = result.current.keyFor("cobro-200");

    expect(second).not.toBe(first);
    expect(result.current.keyFor("cobro-200")).toBe(second);
  });

  it("volver a los datos anteriores NO reutiliza la clave vieja (ese intento ya cambió)", () => {
    const { result } = renderHook(() => useIdempotencyKey());

    const first = result.current.keyFor("A");
    result.current.keyFor("B");

    expect(result.current.keyFor("A")).not.toBe(first);
  });

  it("después de un envío exitoso, el próximo es otro intento aunque los datos sean idénticos", () => {
    const { result } = renderHook(() => useIdempotencyKey());

    const first = result.current.keyFor("cobro-100");
    result.current.reset();

    expect(result.current.keyFor("cobro-100")).not.toBe(first);
  });

  it("la clave cumple el formato que exige el servidor (8 a 64 caracteres: letras, números y . _ : -)", () => {
    const { result } = renderHook(() => useIdempotencyKey());

    for (let i = 0; i < 20; i++) {
      const key = result.current.keyFor(`datos-${i}`);
      expect(key).toMatch(/^[A-Za-z0-9._:-]{8,64}$/);
    }
  });
});
