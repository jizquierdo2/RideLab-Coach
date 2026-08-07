import type { PerformanceAssessment } from "@ridelab/shared";

/**
 * Ajuste de cargas para "Aplicar ajuste sugerido".
 *
 * Las cargas las escribe el usuario a mano ("24 kg", "40cm", "8"), así que acá
 * sólo se toca el número y se conserva literal lo que venga después. Una carga
 * sin número (p. ej. "peso corporal") no se puede escalar y se devuelve
 * `undefined` en vez de inventar un valor.
 */

/** Punto medio del rango que sugiere el motor. `undefined` si no hay ajuste que aplicar. */
export function midpointPercent(
  suggested: PerformanceAssessment["suggestedLoadAdjustmentPercent"],
): number | undefined {
  if (!suggested) return undefined;
  const mid = (suggested.min + suggested.max) / 2;
  return mid === 0 ? undefined : mid;
}

/** Redondeo a 0.5, que es el salto más fino que se usa en la práctica con mancuernas y discos. */
function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * Escala el número de una carga escrita a mano.
 *
 * @returns la carga ajustada, o `undefined` si el texto no empieza con un número
 * (nada que escalar) o si el resultado no cambiaría nada.
 */
export function scaleLoadText(load: string, percent: number): string | undefined {
  const match = load.trim().match(/^(\d+(?:[.,]\d+)?)(.*)$/);
  if (!match) return undefined;

  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const scaled = roundToHalf(amount * (1 + percent / 100));
  if (scaled <= 0 || scaled === amount) return undefined;

  const suffix = match[2];
  // `Number` ya deja "20.5" y "20" sin ceros sobrantes.
  return `${scaled}${suffix}`;
}

export interface AdjustedLoads {
  /** Cargas nuevas por `exerciseId`, sólo para las que se pudieron escalar. */
  loads: Record<string, string>;
  /** Cuántas cargas se ajustaron. 0 significa que el botón no tenía nada que hacer. */
  adjustedCount: number;
}

/**
 * Aplica el porcentaje a las cargas del último registro.
 *
 * Sólo devuelve las que efectivamente cambiaron: así la UI puede informar el
 * número real de ejercicios ajustados en vez de afirmar que se ajustó todo.
 */
export function adjustLoadsFromLastLog(
  lastExercises: ReadonlyArray<{ exerciseId: string; load?: string }>,
  percent: number,
): AdjustedLoads {
  const loads: Record<string, string> = {};

  for (const exercise of lastExercises) {
    if (!exercise.load) continue;
    const scaled = scaleLoadText(exercise.load, percent);
    if (scaled) loads[exercise.exerciseId] = scaled;
  }

  return { loads, adjustedCount: Object.keys(loads).length };
}
