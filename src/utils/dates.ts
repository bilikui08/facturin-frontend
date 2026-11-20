/** Hoy en Argentina (yyyy-mm-dd), sin depender de la zona horaria del navegador. */
export const todayInArgentina = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
