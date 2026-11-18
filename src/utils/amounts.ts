/**
 * Importes del comprobante. Según el manual de ARCA (WSFEv1), ImpTotal/ImpNeto/ImpIVA... admiten
 * 13 dígitos enteros y 2 decimales (error 10056 si se excede). Cantidad y precio no se envían a ARCA
 * como tales, pero se guardan con 2 decimales, y el importe de cada línea se redondea a 2 decimales
 * igual que en el backend, para que el total que se ve sea el que se informa.
 */
export const MAX_DECIMALS = 2;
export const MAX_INTEGER_DIGITS = 13;

/** Redondeo comercial (mitad hacia arriba) a 2 decimales, sin errores de punto flotante (ej. 96960.625). */
export const round2 = (n: number): number =>
  Number(`${Math.round(Number(`${n}e${MAX_DECIMALS}`))}e-${MAX_DECIMALS}`);

/** Recorta lo que se escribe a un máximo de `decimals` decimales (no deja tipear más). */
export const limitDecimals = (value: string, decimals: number = MAX_DECIMALS): string => {
  const dot = value.indexOf(".");
  return dot === -1 ? value : value.slice(0, dot + 1 + decimals);
};

export interface AmountItem {
  quantity: string;
  price: string;
}

const toCents = (value: string): bigint => {
  const n = Number(value);
  return BigInt(Number.isFinite(n) ? Math.round(n * 100) : 0);
};

/**
 * Importe de una línea en centavos: cantidad × precio con aritmética entera (BigInt), redondeado a
 * centavos (mitad hacia arriba). En punto flotante 1,5 × 0,15 da 0,22499999999999998 y saldría 0,22
 * en lugar de 0,23. Es el mismo cálculo exacto que hace el backend.
 */
const lineCents = (item: AmountItem): bigint =>
  (toCents(item.quantity) * toCents(item.price) + 50n) / 100n;

/** Importe de una línea: cantidad × precio, con 2 decimales. */
export const lineAmount = (item: AmountItem): number => Number(lineCents(item)) / 100;

/** Total del comprobante: suma exacta de los importes de línea ya redondeados. */
export const invoiceTotal = (items: AmountItem[]): number =>
  Number(items.reduce((sum, item) => sum + lineCents(item), 0n)) / 100;

/** ARCA admite hasta 13 dígitos enteros. */
export const exceedsMaxAmount = (amount: number): boolean => amount >= 10 ** MAX_INTEGER_DIGITS;
