import { z } from "zod";
import { heartRateZoneSecondsSchema } from "./training-history";

/**
 * Resumen cardiovascular de UN ejercicio, calculado cruzando su intervalo
 * real (`ExerciseExecution.startedAt`/`completedAt`) contra las muestras de
 * `ActivityTimeSeries` de la actividad Garmin vinculada.
 *
 * A propósito no incluye Training Effect ni calorías: esos son agregados de
 * toda la actividad y nunca se reparten entre ejercicios (ver
 * `computeExercisePhysiology` en `training/exercise-physiology.ts`).
 */
export const exercisePhysiologyDataQualitySchema = z.enum(["good", "limited", "insufficient"]);

export type ExercisePhysiologyDataQuality = z.infer<typeof exercisePhysiologyDataQualitySchema>;

export const postExerciseRecoverySchema = z.object({
  heartRateAtEnd: z.number(),
  heartRateAfter60Seconds: z.number(),
  decrease: z.number(),
});

export type PostExerciseRecovery = z.infer<typeof postExerciseRecoverySchema>;

export const exercisePhysiologySummarySchema = z.object({
  id: z.string().min(1),
  exerciseExecutionId: z.string().min(1),
  garminActivityId: z.string().min(1),

  intervalStartedAt: z.string(),
  intervalCompletedAt: z.string(),
  durationSeconds: z.number().nonnegative(),

  sampleCount: z.number().int().nonnegative(),
  dataQuality: exercisePhysiologyDataQualitySchema,

  averageHeartRate: z.number().optional(),
  minimumHeartRate: z.number().optional(),
  maximumHeartRate: z.number().optional(),
  heartRateAtStart: z.number().optional(),
  heartRateAtEnd: z.number().optional(),
  heartRateChange: z.number().optional(),

  /**
   * Sólo se puebla si el cruce trae también los límites de zona del atleta
   * (no forma parte de esta fase — hoy queda `undefined` por defecto, nunca
   * se inventa una distribución).
   */
  timeInHeartRateZones: z.array(heartRateZoneSecondsSchema).optional(),

  /** Sólo si la ventana de 60s posteriores no se superpone con el siguiente ejercicio. */
  postExerciseRecovery: postExerciseRecoverySchema.optional(),

  perceivedEffort: z.number().int().min(1).max(10).optional(),
  calculatedAt: z.string(),
});

export type ExercisePhysiologySummary = z.infer<typeof exercisePhysiologySummarySchema>;
