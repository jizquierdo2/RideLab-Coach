import { z } from "zod";

/**
 * Ejecución real de una sesión planificada: cuándo empezó, cuándo terminó y
 * cómo fue, en un formato más simple que `SessionLog` (que registra el
 * detalle por ejercicio). Es la señal principal que consume el matcher para
 * encontrar la actividad Garmin correspondiente.
 */
export const sessionExecutionSchema = z.object({
  id: z.string().min(1),
  plannedSessionId: z.string().min(1),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  status: z.enum(["started", "completed", "abandoned"]),
  actualRpe: z.number().int().min(1).max(10).optional(),
  painLevel: z.number().int().min(0).max(10).optional(),
  notes: z.string().optional(),
});

export type SessionExecution = z.infer<typeof sessionExecutionSchema>;

/**
 * Actividad sincronizada desde Garmin.
 *
 * Independiente de `activitySchema` (usado por `GarminSnapshot.recentActivities`):
 * ese tipo no trae Training Effect ni `syncedAt`, y mezclar ambos conceptos
 * complicaría más de lo que ahorraría. `id` es el id de la actividad en Garmin,
 * y sirve directo para evitar importarla dos veces.
 */
export const heartRateZoneSecondsSchema = z.object({
  zone: z.number().int().min(1).max(5),
  seconds: z.number().nonnegative(),
});

export const garminActivitySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  activityType: z.string(),
  startedAt: z.string(),
  durationSeconds: z.number().nonnegative(),
  calories: z.number().optional(),
  averageHeartRate: z.number().optional(),
  maxHeartRate: z.number().optional(),
  aerobicTrainingEffect: z.number().optional(),
  anaerobicTrainingEffect: z.number().optional(),
  distanceMeters: z.number().optional(),
  elevationGainMeters: z.number().optional(),
  heartRateZones: z.array(heartRateZoneSecondsSchema).optional(),
  syncedAt: z.string(),
});

export type GarminActivity = z.infer<typeof garminActivitySchema>;

/**
 * Lista de tipos de actividad Garmin que el matcher considera compatibles.
 * Configurable a propósito: ampliar esto no requiere tocar el motor de scoring.
 */
export const MATCHABLE_GARMIN_TYPES = [
  "cardio",
  "strength_training",
  "indoor_cardio",
  "hiit",
  "other",
] as const;

export type MatchableGarminType = (typeof MATCHABLE_GARMIN_TYPES)[number];

/** Vínculo entre una ejecución y una actividad Garmin. */
export const activitySessionMatchSchema = z.object({
  id: z.string().min(1),
  sessionExecutionId: z.string().min(1),
  garminActivityId: z.string().min(1),
  status: z.enum(["suggested", "confirmed", "rejected"]),
  method: z.enum(["automatic", "manual"]),
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
  confirmedAt: z.string().optional(),
});

export type ActivitySessionMatch = z.infer<typeof activitySessionMatchSchema>;

/** Proyección liviana de una sesión planificada, calculada desde el plan — no se persiste aparte. */
export interface PlannedSession {
  id: string;
  planId: string;
  title: string;
  focus: string;
  scheduledDate?: string;
  plannedDurationMinutes: number;
  exerciseCount: number;
}

/** Vista combinada de lo planificado, lo ejecutado, lo sincronizado y el vínculo entre ambos. */
export interface CombinedTrainingRecord {
  plannedSession: PlannedSession;
  execution: SessionExecution;
  garminActivity?: GarminActivity;
  match?: ActivitySessionMatch;
}
