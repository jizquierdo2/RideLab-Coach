import type { ExerciseExecution } from "../types/exercise-execution";
import type { ExercisePhysiologySummary } from "../types/exercise-physiology";
import type { SessionExecution } from "../types/training-history";
import type { SessionLog } from "../types/log";

/**
 * Un renglón de historial de un ejercicio: separa explícitamente lo que vino
 * de Garmin (`physiology`), lo que ingresó el usuario (`load`/`actualReps`/
 * `perceivedEffort`) y los timestamps reales — sin frasear ninguna
 * interpretación ("mejoraste", "empeoraste"). Eso es responsabilidad de la
 * capa de presentación (UI/Coach), que debe usar lenguaje cauteloso.
 */
export interface ExercisePerformanceHistoryEntry {
  exerciseExecutionId: string;
  sessionExecutionId: string;
  catalogExerciseId: string;
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
  perceivedEffort?: number;
  load?: string;
  actualReps?: string;
  physiology?: ExercisePhysiologySummary;
}

/**
 * Historial de ejecuciones completadas de un ejercicio del catálogo, en un
 * rango de fechas — para responder "¿cómo me fue en los Box Jumps?" o
 * comparar contra la vez anterior.
 *
 * Puro: no lee de AsyncStorage ni del backend, el llamador ya trae las
 * colecciones cargadas. Reconstruye `load`/`actualReps` cruzando con
 * `SessionLog` a través de `SessionExecution.plannedSessionId`, porque esos
 * campos hoy sólo viven en el registro post-sesión, no en `ExerciseExecution`.
 */
export function getExercisePerformanceHistory(params: {
  catalogExerciseId: string;
  /** YYYY-MM-DD, inclusive. */
  startDate: string;
  endDate: string;
  executions: ExerciseExecution[];
  sessionExecutions: SessionExecution[];
  logs: SessionLog[];
  physiologySummaries: ExercisePhysiologySummary[];
}): ExercisePerformanceHistoryEntry[] {
  const sessionExecutionById = new Map(params.sessionExecutions.map((execution) => [execution.id, execution]));
  const physiologyByExecutionId = new Map(
    params.physiologySummaries.map((summary) => [summary.exerciseExecutionId, summary]),
  );

  return params.executions
    .filter((execution) => execution.catalogExerciseId === params.catalogExerciseId && execution.status === "completed")
    .filter((execution) => {
      const day = (execution.completedAt ?? execution.startedAt ?? "").slice(0, 10);
      return day >= params.startDate && day <= params.endDate;
    })
    .map((execution): ExercisePerformanceHistoryEntry => {
      const sessionExecution = sessionExecutionById.get(execution.sessionExecutionId);
      const log = sessionExecution
        ? params.logs.find(
            (candidate) =>
              candidate.sessionId === sessionExecution.plannedSessionId &&
              candidate.exercises.some((exercise) => exercise.exerciseId === execution.trainingExerciseId),
          )
        : undefined;
      const exerciseLog = log?.exercises.find((exercise) => exercise.exerciseId === execution.trainingExerciseId);

      return {
        exerciseExecutionId: execution.id,
        sessionExecutionId: execution.sessionExecutionId,
        catalogExerciseId: execution.catalogExerciseId,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        durationSeconds: execution.durationSeconds,
        perceivedEffort: execution.rpe,
        load: exerciseLog?.load,
        actualReps: exerciseLog?.actualReps,
        physiology: physiologyByExecutionId.get(execution.id),
      };
    })
    .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""));
}
