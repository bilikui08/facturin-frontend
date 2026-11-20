import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAction } from "../useAction";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("useAction (protección del doble click)", () => {
  it("marca la acción en curso y la libera al terminar", async () => {
    const { result } = renderHook(() => useAction());
    const work = deferred<string>();

    let outcome: Promise<string | undefined>;
    act(() => {
      outcome = result.current.run("guardar", () => work.promise);
    });

    expect(result.current.pending).toBe("guardar");

    await act(async () => {
      work.resolve("hecho");
      expect(await outcome).toBe("hecho");
    });

    expect(result.current.pending).toBeNull();
  });

  it("descarta una segunda acción que llega en el mismo instante, antes de que React vuelva a dibujar", async () => {
    const { result } = renderHook(() => useAction());
    const calls: string[] = [];
    const work = deferred<void>();

    let first: Promise<unknown>;
    let second: Promise<unknown>;
    // Los dos "clicks" en el mismo turno, sin render entre ellos: solo la referencia puede frenar el segundo
    act(() => {
      first = result.current.run("imputar", async () => { calls.push("primero"); await work.promise; });
      second = result.current.run("imputar", async () => { calls.push("segundo"); });
    });

    await act(async () => {
      work.resolve();
      await first;
      expect(await second).toBeUndefined();
    });

    expect(calls).toEqual(["primero"]);
  });

  it("también descarta una acción DISTINTA mientras otra está en curso", async () => {
    const { result } = renderHook(() => useAction());
    const work = deferred<void>();
    const other = deferred<void>();
    let ran = false;

    let first: Promise<unknown>;
    act(() => {
      first = result.current.run("imputar", () => work.promise);
    });

    await act(async () => {
      await result.current.run("anular", async () => { ran = true; await other.promise; });
      work.resolve();
      await first;
    });

    expect(ran).toBe(false);
  });

  it("después de terminar admite una acción nueva", async () => {
    const { result } = renderHook(() => useAction());
    let count = 0;

    await act(async () => {
      await result.current.run("a", async () => { count++; });
      await result.current.run("a", async () => { count++; });
    });

    expect(count).toBe(2);
  });

  it("si la acción falla se libera igual y el error le llega a quien la llamó", async () => {
    const { result } = renderHook(() => useAction());

    await act(async () => {
      await expect(result.current.run("a", async () => { throw new Error("falló"); })).rejects.toThrow("falló");
    });

    expect(result.current.pending).toBeNull();

    let ran = false;
    await act(async () => {
      await result.current.run("a", async () => { ran = true; });
    });
    expect(ran).toBe(true);
  });
});
