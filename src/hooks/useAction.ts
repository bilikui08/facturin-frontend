import { useCallback, useRef, useState } from "react";

/**
 * Protección contra el doble click en las acciones que crean o cambian datos.
 *
 * `run(key, action)` marca la acción como en curso ANTES de empezar y descarta cualquier otra que llegue mientras tanto (aunque
 * sea en el mismo instante: la barrera es una referencia, no depende de que React haya vuelto a dibujar). `pending` dice cuál está
 * corriendo (para mostrar el spinner en ese botón) y mientras no sea `null` conviene deshabilitar todos los botones de la pantalla.
 * La segunda barrera es la del servidor (`Idempotency-Key` y los 409 de estado).
 */
export const useAction = () => {
  const busy = useRef(false);
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(async <T,>(key: string, action: () => Promise<T>): Promise<T | undefined> => {
    if (busy.current) return undefined;

    busy.current = true;
    setPending(key);

    try {
      return await action();
    } finally {
      busy.current = false;
      setPending(null);
    }
  }, []);

  return { pending, run };
};

/** Lo que los componentes hijos reciben para ejecutar acciones con la protección del doble click. */
export type Actions = ReturnType<typeof useAction>;
