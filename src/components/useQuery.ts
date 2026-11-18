import { useEffect, useRef, useState } from "react";

interface Loaded<T> {
  key: string;
  data: T | null;
  error: string;
}

/**
 * Consulta a la API que se repite cuando cambian las dependencias.
 * - Mientras carga conserva el resultado anterior (la tabla no parpadea).
 * - Cancela la consulta anterior si las dependencias cambian antes de que termine.
 */
export const useQuery = <T,>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  fallbackError: string,
) => {
  const key = JSON.stringify(deps);
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null);
  const latest = useRef({ fetcher, fallbackError });

  useEffect(() => {
    latest.current = { fetcher, fallbackError };
  });

  useEffect(() => {
    const controller = new AbortController();

    latest.current
      .fetcher(controller.signal)
      .then((data) => setLoaded({ key, data, error: "" }))
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoaded({ key, data: null, error: err instanceof Error ? err.message : latest.current.fallbackError });
      });

    return () => controller.abort();
  }, [key]);

  const isCurrent = loaded?.key === key;

  return {
    data: loaded?.data ?? null,
    loading: !isCurrent,
    error: isCurrent ? loaded.error : "",
  };
};
