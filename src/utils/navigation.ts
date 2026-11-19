/**
 * Recarga la aplicación en una ruta. Al cambiar de empresa se hace una carga completa a propósito: así no queda en
 * memoria ningún dato de la empresa anterior (listas, formularios, cachés).
 */
export const reloadAt = (path: string): void => {
  window.location.assign(path);
};
