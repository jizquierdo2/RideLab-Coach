/**
 * Conversión a hora de Chile continental (`America/Santiago`), independiente de
 * la zona horaria del dispositivo. Se apoya en `Intl.DateTimeFormat`, que trae
 * ICU completo en Hermes desde Expo SDK ~47 — no se agrega ninguna librería de
 * fechas nueva para esto.
 */

const SANTIAGO_TZ = "America/Santiago";

/** Día local en Santiago, formato `YYYY-MM-DD`. El locale `en-CA` produce ese orden directo. */
export function santiagoDayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SANTIAGO_TZ }).format(new Date(iso));
}

/** Hora local en Santiago, formato `HH:mm`. */
export function formatSantiagoTime(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: SANTIAGO_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** Minutos de superposición entre dos rangos ISO. 0 si no se solapan. */
export function overlapMinutes(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const start = Math.max(new Date(aStart).getTime(), new Date(bStart).getTime());
  const end = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime());
  return Math.max(0, (end - start) / 60_000);
}
