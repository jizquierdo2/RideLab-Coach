import { z } from "zod";

/**
 * Ejecución real de un ejercicio dentro de una sesión.
 *
 * Independiente de `SessionExecution` (que sólo marca inicio/fin de la sesión
 * completa) y de `ExerciseLog` (resumen post-hoc de carga/reps sin timestamps).
 * Esto es el intervalo real `[startedAt, completedAt]` por ejercicio, capturado
 * en el handler del clic — nunca en render ni en sincronización — para poder
 * cruzarlo después con las muestras de frecuencia cardíaca de Garmin.
 *
 * `trainingExerciseId` referencia el `id` del `TrainingExercise` dentro de la
 * plantilla (p. ej. `w1-d1-ex4`); `catalogExerciseId` se copia al crear el
 * registro para no depender de resolver la plantilla otra vez sólo para saber
 * qué ejercicio del catálogo fue.
 */
export const exerciseExecutionStatusSchema = z.enum(["pending", "active", "completed", "skipped"]);

export type ExerciseExecutionStatus = z.infer<typeof exerciseExecutionStatusSchema>;

export const exerciseExecutionSchema = z.object({
  id: z.string().min(1),
  sessionExecutionId: z.string().min(1),
  trainingExerciseId: z.string().min(1),
  catalogExerciseId: z.string().min(1),
  order: z.number().int().nonnegative(),
  status: exerciseExecutionStatusSchema,
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  skippedAt: z.string().optional(),
  /** Duración real en segundos, calculada de `completedAt - startedAt` — nunca inferida del orden. */
  durationSeconds: z.number().nonnegative().optional(),
  /** Esfuerzo percibido 1-10, distinto de cualquier Training Effect de Garmin. */
  rpe: z.number().int().min(1).max(10).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ExerciseExecution = z.infer<typeof exerciseExecutionSchema>;

/**
 * Evento de trazabilidad, de sólo-escritura-por-transición.
 *
 * `ExerciseExecution` es la fuente de verdad de "qué es cierto ahora"; este
 * log existe únicamente para no perder el rastro cuando el usuario deshace un
 * "completado" accidental — el evento original (`completed`) permanece aunque
 * el estado actual vuelva a `active`. No se reconstruye estado a partir de
 * estos eventos, sólo se leen para mostrar historial.
 */
export const exerciseExecutionEventSchema = z.object({
  id: z.string().min(1),
  exerciseExecutionId: z.string().min(1),
  type: z.enum(["started", "completed", "completion_reverted", "skipped"]),
  occurredAt: z.string(),
});

export type ExerciseExecutionEvent = z.infer<typeof exerciseExecutionEventSchema>;
