import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useQuery } from "../../components/useQuery";

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
};

describe("useQuery", () => {
  it("una respuesta vieja que llega tarde no pisa la de la consulta vigente", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const { result, rerender } = renderHook(({ n }) => useQuery(() => (n === 1 ? first.promise : second.promise), [n], "error"), { initialProps: { n: 1 } });

    rerender({ n: 2 });
    await act(async () => { second.resolve("nueva"); });
    await waitFor(() => expect(result.current.data).toBe("nueva"));
    await act(async () => { first.resolve("vieja"); });

    expect(result.current.data).toBe("nueva");
  });
});
