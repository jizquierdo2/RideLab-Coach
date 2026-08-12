import type { ExerciseExecution, ExerciseExecutionEvent } from "../types/exercise-execution";

/**
 * Escenario demo del pedido: 3 ejercicios de `w1-d1` (90/90 de cadera, Box
 * Jump con caída controlada, Sentadilla Goblet) ya completados, con horarios
 * dentro de la ventana de `buildDemoSessionExecution()` (19:04-20:04 hora de
 * Santiago) — sirve para ejercitar el cruce con Garmin de la Fase B y la UI
 * de rendimiento de la Fase C sin depender de que el usuario complete una
 * sesión real primero.
 */

const SESSION_EXECUTION_ID = "demo-exec-w1-d1";

export function buildDemoExerciseExecutions(): ExerciseExecution[] {
  return [
    {
      id: "demo-ex-exec-w1-d1-ex3",
      sessionExecutionId: SESSION_EXECUTION_ID,
      trainingExerciseId: "w1-d1-ex3",
      catalogExerciseId: "hip-90-90",
      order: 2,
      status: "completed",
      startedAt: "2026-08-05T23:12:00.000Z", // 19:12 hora de Santiago
      completedAt: "2026-08-05T23:16:00.000Z", // 19:16 hora de Santiago
      durationSeconds: 240,
      rpe: 3,
      createdAt: "2026-08-05T23:12:00.000Z",
      updatedAt: "2026-08-05T23:16:00.000Z",
    },
    {
      id: "demo-ex-exec-w1-d1-ex4",
      sessionExecutionId: SESSION_EXECUTION_ID,
      trainingExerciseId: "w1-d1-ex4",
      catalogExerciseId: "box-jump",
      order: 3,
      status: "completed",
      startedAt: "2026-08-05T23:18:00.000Z", // 19:18 hora de Santiago
      completedAt: "2026-08-05T23:24:00.000Z", // 19:24 hora de Santiago
      durationSeconds: 360,
      rpe: 8,
      createdAt: "2026-08-05T23:18:00.000Z",
      updatedAt: "2026-08-05T23:24:00.000Z",
    },
    {
      id: "demo-ex-exec-w1-d1-ex5",
      sessionExecutionId: SESSION_EXECUTION_ID,
      trainingExerciseId: "w1-d1-ex5",
      catalogExerciseId: "goblet-squat",
      order: 4,
      status: "completed",
      startedAt: "2026-08-05T23:27:00.000Z", // 19:27 hora de Santiago
      completedAt: "2026-08-05T23:35:00.000Z", // 19:35 hora de Santiago
      durationSeconds: 480,
      rpe: 7,
      createdAt: "2026-08-05T23:27:00.000Z",
      updatedAt: "2026-08-05T23:35:00.000Z",
    },
  ];
}

export function buildDemoExerciseExecutionEvents(): ExerciseExecutionEvent[] {
  return buildDemoExerciseExecutions().flatMap((execution, index) => [
    {
      id: `demo-ex-event-${index}-started`,
      exerciseExecutionId: execution.id,
      type: "started" as const,
      occurredAt: execution.startedAt!,
    },
    {
      id: `demo-ex-event-${index}-completed`,
      exerciseExecutionId: execution.id,
      type: "completed" as const,
      occurredAt: execution.completedAt!,
    },
  ]);
}
