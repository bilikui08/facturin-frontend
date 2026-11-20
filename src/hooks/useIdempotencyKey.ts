import { useCallback, useRef } from "react";

const newKey = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/**
 * Clave de idempotencia (`Idempotency-Key`) de un INTENTO de envío. `keyFor(huella)` devuelve la misma clave mientras se reenvíen los
 * mismos datos (doble click, reintento tras un corte de red: el servidor responde con lo ya hecho en lugar de repetirlo) y una clave
 * nueva apenas los datos cambian. `reset()` después de un envío exitoso: el próximo cobro es otro intento.
 */
export const useIdempotencyKey = () => {
  const current = useRef<{ fingerprint: string; key: string } | null>(null);

  const keyFor = useCallback((fingerprint: string): string => {
    if (current.current?.fingerprint !== fingerprint) current.current = { fingerprint, key: newKey() };
    return current.current.key;
  }, []);

  const reset = useCallback(() => {
    current.current = null;
  }, []);

  return { keyFor, reset };
};
