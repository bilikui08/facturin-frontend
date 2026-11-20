/**
 * Importes en pesos que se escriben a mano.
 *
 * El campo guarda EXACTAMENTE lo que la persona escribe (solo se filtran los caracteres que no pueden formar parte de un importe) y el
 * texto se interpreta recién al usarlo, siempre mostrando qué se va a enviar. Interpretar tecla por tecla rompía el formato argentino
 * ("1.500,75" quedaba en 150.75 al tipearlo), y con dinero un error silencioso no es aceptable.
 */

/** Deja solo dígitos, puntos y comas (sin interpretar nada todavía). */
export const filterAmountChars = (raw: string): string => raw.replace(/[^\d.,]/g, "").slice(0, 24);

/** Solo lo que admite el servidor: hasta 13 dígitos enteros. */
const MAX_INTEGER = /^\d{1,13}$/;

/**
 * Interpreta lo escrito como pesos y devuelve "1234.50" (siempre con 2 decimales), o null si no es un importe válido o es ambiguo.
 *
 *   "1.500,75" → "1500.75"   "1500,75" → "1500.75"   "1500.75" → "1500.75"   "12.5" → "12.50"
 *   "1.500"    → "1500.00"   (un punto seguido de exactamente 3 dígitos es separador de miles)
 *   "0.123", "1,2,3", "12.34,5", "1500." → null
 */
export const parseAmount = (raw: string): string | null => {
  const text = raw.trim();
  let integer: string;
  let decimals = "";

  if (text.includes(",")) {
    const parts = text.split(",");
    if (parts.length !== 2 || !/^\d{0,2}$/.test(parts[1])) return null;
    const whole = parts[0];
    if (!/^\d+$/.test(whole) && !/^\d{1,3}(\.\d{3})+$/.test(whole)) return null;
    integer = whole.replace(/\./g, "");
    decimals = parts[1];
  } else if (text.includes(".")) {
    if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(text)) integer = text.replace(/\./g, "");
    else if (/^\d+\.\d{1,2}$/.test(text)) [integer, decimals] = text.split(".");
    else return null;
  } else if (/^\d+$/.test(text)) {
    integer = text;
  } else {
    return null;
  }

  integer = integer.replace(/^0+(?=\d)/, "");

  return MAX_INTEGER.test(integer) ? `${integer}.${(decimals + "00").slice(0, 2)}` : null;
};

/** ¿Es un importe válido y mayor a cero? Devuelve el importe normalizado ("1500.75") o null. */
export const parsePositiveAmount = (raw: string): string | null => {
  const parsed = parseAmount(raw);
  return parsed !== null && Number(parsed) > 0 ? parsed : null;
};

/** Centavos exactos de un importe normalizado ("1234.50" → 123450), sin errores de punto flotante. */
export const amountToCents = (amount: string): number => {
  const [integer, decimals = ""] = amount.split(".");
  return Number(integer) * 100 + Number((decimals + "00").slice(0, 2));
};

/** Importe normalizado ("1234.50") de una cantidad de centavos. */
export const centsToAmount = (cents: number): string => `${cents < 0 ? "-" : ""}${Math.trunc(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;
