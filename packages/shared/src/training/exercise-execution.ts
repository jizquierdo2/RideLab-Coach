import type { ExerciseExecution, ExerciseExecutionEvent } from "../types/exercise-execution";

/**
 * Transiciones de estado de un ejercicio dentro de una sesión.
 *
 * Puras a propósito: nunca leen el reloj ni generan ids — el llamador captura
 * `occurredAt` en el handler del clic (nunca en render ni en sincronización)
 * y genera el `eventId`, así estas funciones son deterministas y testeables
 * sin AsyncStorage. `ExerciseExecution` sigue siendo la fuente de verdad de
 * "qué es cierto ahora"; `ExerciseExecutionEvent` es de sólo-escritura, para
 * trazabilidad cuando el usuario deshace un "completado" accidental.
 */

export interface ExerciseExecutionTransition {
  execution: ExerciseExecution;
  event: ExerciseExecutionEvent;
}

function assertStatus(execution: ExerciseExecution, expected: ExerciseExecution["status"], action: string): void {
  if (execution.status !== expected) {
    throw new Error(
      `No se puede ${action}: el ejercicio está en estado "${execution.status}", se esperaba "${expected}"`,
    );
  }
}

/** Primer ejercicio pendiente por orden — para destacar el siguiente sin auto-iniciarlo. */
export function nextPendingExercise(executions: ExerciseExecution[]): ExerciseExecution | undefined {
  return [...executions].sort((a, b) => a.order - b.order).find((execution) => execution.status === "pending");
}

/** Ejercicio actualmente activo, si existe — usado para el guard de "sólo uno a la vez". */
export function findActiveExecution(executions: ExerciseExecution[]): ExerciseExecution | undefined {
  return executions.find((execution) => execution.status === "active");
}

export function startExercise(
  execution: ExerciseExecution,
  params: { occurredAt: string; eventId: string },
): ExerciseExecutionTransition {
  assertStatus(execution, "pending", "iniciar el ejercicio");
  return {
    execution: {
      ...execution,
      status: "active",
      startedAt: params.occurredAt,
      updatedAt: params.occurredAt,
    },
    event: {
      id: params.eventId,
      exerciseExecutionId: execution.id,
      type: "started",
      occurredAt: params.occurredAt,
    },
  };
}

export function completeExercise(
  execution: ExerciseExecution,
  params: { occurredAt: string; eventId: string; rpe?: number },
): ExerciseExecutionTransition {
  assertStatus(execution, "active", "completar el ejercicio");
  const startedAt = execution.startedAt;
  if (!startedAt) {
    throw new Error("No se puede completar un ejercicio sin hora de inicio registrada");
  }

  const durationSeconds = Math.max(
    0,
    (new Date(params.occurredAt).getTime() - new Date(startedAt).getTime()) / 1000,
  );

  return {
    execution: {
      ...execution,
      status: "completed",
      completedAt: params.occurredAt,
      durationSeconds,
      rpe: params.rpe ?? execution.rpe,
      updatedAt: params.occurredAt,
    },
    event: {
      id: params.eventId,
      exerciseExecutionId: execution.id,
      type: "completed",
      occurredAt: params.occurredAt,
    },
  };
}

/**
 * Deshace un "completado" accidental, volviendo el ejercicio a `active` (sigue
 * en curso desde su `startedAt` original). El evento `completed` original NO
 * se borra del log — sólo se agrega un evento `completion_reverted` nuevo.
 */
export function revertCompletion(
  execution: ExerciseExecution,
  params: { occurredAt: string; eventId: string },
): ExerciseExecutionTransition {
  assertStatus(execution, "completed", "deshacer el ejercicio");
  return {
    execution: {
      ...execution,
      status: "active",
      completedAt: undefined,
      durationSeconds: undefined,
      rpe: undefined,
      updatedAt: params.occurredAt,
    },
    event: {
      id: params.eventId,
      exerciseExecutionId: execution.id,
      type: "completion_reverted",
      occurredAt: params.occurredAt,
    },
  };
}

export function skipExercise(
  execution: ExerciseExecution,
  params: { occurredAt: string; eventId: string },
): ExerciseExecutionTransition {
  if (execution.status !== "pending" && execution.status !== "active") {
    throw new Error(`No se puede omitir: el ejercicio está en estado "${execution.status}"`);
  }
  return {
    execution: {
      ...execution,
      status: "skipped",
      skippedAt: params.occurredAt,
      updatedAt: params.occurredAt,
    },
    event: {
      id: params.eventId,
      exerciseExecutionId: execution.id,
      type: "skipped",
      occurredAt: params.occurredAt,
    },
  };
}
