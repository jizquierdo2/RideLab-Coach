import { z } from "zod";

/**
 * Muestras crudas de una actividad Garmin, con timestamp.
 *
 * Distinto de `GarminActivity` (agregado por actividad): esto es la serie
 * temporal que permite cruzar cada muestra contra el intervalo real de un
 * ejercicio. Sólo se piden campos que Garmin realmente entregue con
 * timestamp — nunca se reparte un agregado de toda la actividad entre
 * ejercicios, y nunca se inventa una muestra que no vino en la respuesta.
 */
export const heartRateSampleSchema = z.object({
  /** ISO 8601 UTC, con precisión de segundos como mínimo. */
  timestamp: z.string(),
  heartRate: z.number().nonnegative().optional(),
});

export type HeartRateSample = z.infer<typeof heartRateSampleSchema>;

export const activityTimeSeriesSchema = z.object({
  activityId: z.string().min(1),
  /** `mock` cuando viene del proveedor demo — nunca se presenta como si fuera de Garmin. */
  source: z.enum(["garmin", "mock"]),
  /** Intervalo promedio entre muestras consecutivas, si se puede estimar. */
  sampleIntervalSeconds: z.number().positive().optional(),
  samples: z.array(heartRateSampleSchema).default([]),
  /** Qué métricas trajo esta respuesta con granularidad temporal — hoy sólo "heartRate". */
  availableMetrics: z.array(z.string()).default([]),
});

export type ActivityTimeSeries = z.infer<typeof activityTimeSeriesSchema>;
