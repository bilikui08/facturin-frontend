/**
 * Cómo un componente de la apertura ejecuta una acción que escribe datos. `act` descarta el segundo click, muestra el error si falla,
 * vuelve a cargar la pantalla si sale bien y devuelve si se hizo. `pending` dice qué acción está corriendo (null: ninguna): mientras
 * haya una, todos los botones quedan deshabilitados y el de esa acción muestra el spinner.
 */
export interface OpeningActions {
  pending: string | null;
  act: (key: string, action: () => Promise<unknown>, success?: string) => Promise<boolean>;
}
