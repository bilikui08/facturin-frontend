import { useEffect, useState } from "react";
import { getBranding } from "../services/systemService";

/** Nombre del sistema configurado en auth-api (null mientras carga o si no se pudo consultar). */
export const useBranding = (): string | null => {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void getBranding(controller.signal).then((value) => !controller.signal.aborted && setName(value));
    return () => controller.abort();
  }, []);

  return name;
};
