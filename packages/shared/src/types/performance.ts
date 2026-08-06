import { z } from "zod";

/**
 * Snapshot de rendimiento para la sección "Estado".
 *
 * Independiente de `GarminSnapshot` (el que usa el chat) en su forma, aunque
 * se deriva de los mismos datos — `dataQuality` y `missingMetrics` son
 * obligatorios porque toda la pantalla de Estado depende de saber qué tan
 * completa está la foto antes de recomendar algo.
 */

export const trendSchema = z.enum(["up", "stable", "down"]);
export type Trend = z.infer<typeof trendSchema>;

export const dataQualitySchema = z.enum(["complete", "partial", "insufficient"]);
export type DataQuality = z.infer<typeof dataQualitySchema>;

export const performanceRecentActivitySchema = z.object({
  id: z.string(),
  type: z.string(),
  startedAt: z.string(),
  durationMinutes: z.number(),
  trainingEffect: z.number().optional(),
});

export const performanceSnapshotSchema = z.object({
  id: z.string().min(1),
  /** ISO 8601. Se muestra en America/Santiago (ver `training/local-time.ts`). */
  capturedAt: z.string(),
  source: z.enum(["garmin", "mock"]),
  dataQuality: dataQualitySchema,

  trainingReadiness: z
    .object({
      score: z.number().min(0).max(100).optional(),
      status: z.string().optional(),
    })
    .optional(),

  sleep: z
    .object({
      durationMinutes: z.number().optional(),
      score: z.number().min(0).max(100).optional(),
      baselineDurationMinutes: z.number().optional(),
      status: z.string().optional(),
    })
    .optional(),

  hrv: z
    .object({
      overnightAverage: z.number().optional(),
      baselineLow: z.number().optional(),
      baselineHigh: z.number().optional(),
      status: z.string().optional(),
    })
    .optional(),

  bodyBattery: z
    .object({
      current: z.number().min(0).max(100).optional(),
      chargedDuringSleep: z.number().optional(),
    })
    .optional(),

  restingHeartRate: z
    .object({
      value: z.number().optional(),
      baseline: z.number().optional(),
    })
    .optional(),

  stress: z
    .object({
      average: z.number().min(0).max(100).optional(),
      status: z.string().optional(),
    })
    .optional(),

  recovery: z
    .object({
      remainingHours: z.number().optional(),
    })
    .optional(),

  acuteLoad: z
    .object({
      value: z.number().optional(),
      optimalLow: z.number().optional(),
      optimalHigh: z.number().optional(),
      status: z.string().optional(),
    })
    .optional(),

  trainingStatus: z.string().optional(),

  loadFocus: z
    .object({
      lowAerobic: z.number().optional(),
      highAerobic: z.number().optional(),
      anaerobic: z.number().optional(),
    })
    .optional(),

  vo2Max: z
    .object({
      value: z.number().optional(),
      trend: trendSchema.optional(),
    })
    .optional(),

  intensityMinutes: z.number().optional(),
  recentActivities: z.array(performanceRecentActivitySchema).optional(),

  /** Métricas que se intentaron leer y no existían. Nunca se estiman. */
  missingMetrics: z.array(z.string()).default([]),
});

export type PerformanceSnapshot = z.infer<typeof performanceSnapshotSchema>;
export type PerformanceRecentActivity = z.infer<typeof performanceRecentActivitySchema>;

/**
 * Salida del `PerformanceAssessmentService`. Determinística — nunca depende
 * del LLM para decidir el nivel.
 */
export const performanceAssessmentSchema = z.object({
  level: z.enum(["push", "solid", "controlled", "recover", "insufficient"]),
  label: z.enum(["Con fuerza", "Sólido", "Carga controlada", "Recuperar", "Faltan datos"]),
  headline: z.string(),
  recommendation: z.string(),
  suggestedTrainingMode: z.enum([
    "increase_slightly",
    "follow_plan",
    "reduce_load",
    "recovery_only",
    "unknown",
  ]),
  suggestedLoadAdjustmentPercent: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .optional(),
  positiveDrivers: z.array(z.string()),
  cautionDrivers: z.array(z.string()),
  dataQuality: dataQualitySchema,
});

export type PerformanceAssessment = z.infer<typeof performanceAssessmentSchema>;

/** Mensaje del coach, generado a partir del assessment ya calculado (nunca decide el nivel). */
export const performanceGuidanceSchema = z.object({
  todayMessage: z.string(),
  nextWorkoutAdvice: z.string(),
  weeklyApproach: z.string(),
  motivationalLine: z.string(),
});

export type PerformanceGuidance = z.infer<typeof performanceGuidanceSchema>;

/** Respuesta de `GET /api/garmin/performance`: las tres piezas ya calculadas juntas. */
export const performanceResponseSchema = z.object({
  snapshot: performanceSnapshotSchema,
  assessment: performanceAssessmentSchema,
  guidance: performanceGuidanceSchema,
});

export type PerformanceResponse = z.infer<typeof performanceResponseSchema>;
