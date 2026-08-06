import { MATCHABLE_GARMIN_TYPES, type GarminActivity, type SessionExecution } from "../types/training-history";
import { overlapMinutes, santiagoDayKey } from "./local-time";

/**
 * Motor de matching entre ejecuciones de sesión y actividades Garmin.
 *
 * Reglas determinísticas y auditables, sin IA generativa: una sesión
 * "Potencia e impacto" puede llegar de Garmin como simple "Cardio", así que el
 * nombre nunca es señal. Se usa superposición temporal, cercanía de inicio,
 * mismo día local, similitud de duración y tipo compatible.
 *
 * El motor es puro: no conoce matches ya confirmados en otras ejecuciones. Es
 * responsabilidad de quien llama excluir de `activities` cualquier actividad ya
 * confirmada a otra ejecución, para respetar la regla "una actividad no puede
 * estar confirmada en dos sesiones".
 */

export const AUTO_CONFIRM_THRESHOLD = 0.8;
export const SUGGESTED_THRESHOLD = 0.55;
/** Diferencia máxima entre las dos mejores candidatas para seguir considerándolas "empatadas". */
const TIE_MARGIN = 0.1;
const START_PROXIMITY_MINUTES = 30;
/** Duraciones "compatibles" si la más corta es al menos la mitad de la más larga. */
const DURATION_COMPATIBILITY_RATIO = 0.5;

export interface MatchCandidate {
  activityId: string;
  confidence: number;
}

export interface MatchSuggestion {
  sessionExecutionId: string;
  status: "auto-confirm" | "suggested" | "none";
  best?: MatchCandidate;
  /** Todas las candidatas con confianza >= SUGGESTED_THRESHOLD, orden descendente. */
  candidates: MatchCandidate[];
}

function activityEndIso(activity: GarminActivity): string {
  return new Date(new Date(activity.startedAt).getTime() + activity.durationSeconds * 1000).toISOString();
}

function executionEndIso(execution: SessionExecution, plannedDurationMinutes: number): string {
  if (execution.finishedAt) return execution.finishedAt;
  return new Date(new Date(execution.startedAt).getTime() + plannedDurationMinutes * 60_000).toISOString();
}

function executionMinutes(execution: SessionExecution, plannedDurationMinutes: number): number {
  if (execution.finishedAt) {
    return (new Date(execution.finishedAt).getTime() - new Date(execution.startedAt).getTime()) / 60_000;
  }
  return plannedDurationMinutes;
}

/** Puntaje 0-1 de qué tan probable es que `activity` corresponda a `execution`. */
export function scoreMatch(
  execution: SessionExecution,
  activity: GarminActivity,
  plannedDurationMinutes: number,
): number {
  const execEnd = executionEndIso(execution, plannedDurationMinutes);
  const actEnd = activityEndIso(activity);

  let score = 0;

  if (overlapMinutes(execution.startedAt, execEnd, activity.startedAt, actEnd) > 0) {
    score += 0.4;
  }

  const startDiffMinutes =
    Math.abs(new Date(execution.startedAt).getTime() - new Date(activity.startedAt).getTime()) / 60_000;
  if (startDiffMinutes < START_PROXIMITY_MINUTES) {
    score += 0.25;
  }

  if (santiagoDayKey(execution.startedAt) === santiagoDayKey(activity.startedAt)) {
    score += 0.1;
  }

  const execMin = executionMinutes(execution, plannedDurationMinutes);
  const actMin = activity.durationSeconds / 60;
  if (execMin > 0 && actMin > 0) {
    const ratio = Math.min(execMin, actMin) / Math.max(execMin, actMin);
    if (ratio >= DURATION_COMPATIBILITY_RATIO) score += 0.15;
  }

  if ((MATCHABLE_GARMIN_TYPES as readonly string[]).includes(activity.activityType)) {
    score += 0.1;
  }

  return Math.min(1, score);
}

/**
 * Busca matches para cada ejecución entre las actividades candidatas.
 *
 * @param rejectedPairs pares `${sessionExecutionId}::${garminActivityId}` que el
 *   usuario ya rechazó explícitamente — nunca se vuelven a sugerir.
 */
export function findMatches(
  executions: readonly (SessionExecution & { plannedDurationMinutes: number })[],
  activities: readonly GarminActivity[],
  rejectedPairs: ReadonlySet<string> = new Set(),
): MatchSuggestion[] {
  return executions
    .filter((execution) => execution.status !== "abandoned")
    .map((execution) => {
      const candidates: MatchCandidate[] = activities
        .filter((activity) => !rejectedPairs.has(`${execution.id}::${activity.id}`))
        .map((activity) => ({
          activityId: activity.id,
          confidence: scoreMatch(execution, activity, execution.plannedDurationMinutes),
        }))
        .filter((candidate) => candidate.confidence >= SUGGESTED_THRESHOLD)
        .sort((a, b) => b.confidence - a.confidence);

      const [top, second] = candidates;

      if (!top) {
        return { sessionExecutionId: execution.id, status: "none" as const, candidates: [] };
      }

      if (top.confidence < AUTO_CONFIRM_THRESHOLD) {
        return { sessionExecutionId: execution.id, status: "suggested" as const, best: top, candidates };
      }

      // Empate entre las dos mejores: nunca se decide automáticamente.
      const isTie = Boolean(second) && top.confidence - second.confidence <= TIE_MARGIN;
      return {
        sessionExecutionId: execution.id,
        status: isTie ? ("suggested" as const) : ("auto-confirm" as const),
        best: top,
        candidates,
      };
    });
}
