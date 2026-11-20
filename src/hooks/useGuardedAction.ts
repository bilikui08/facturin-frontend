import { useCallback, useState } from "react";
import { useAction } from "./useAction";

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * `useAction` (barrera del doble click) más el error de la acción para mostrarlo dentro del diálogo. `act` nunca lanza: devuelve
 * `{ ok, value }` o `{ ok: false, error }` (también cuando se descartó un segundo click).
 */
export const useGuardedAction = () => {
  const { pending, run } = useAction();
  const [error, setError] = useState("");

  const act = useCallback(
    async <T,>(key: string, action: () => Promise<T>): Promise<Outcome<T>> => {
      setError("");

      const outcome = await run(key, async (): Promise<Outcome<T>> => {
        try {
          return { ok: true, value: await action() };
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo completar la acción");
          return { ok: false, error: err };
        }
      });

      return outcome ?? { ok: false, error: new Error("Acción en curso") };
    },
    [run],
  );

  return { pending, error, setError, act };
};
