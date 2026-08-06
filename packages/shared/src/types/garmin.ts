import { z } from "zod";

/**
 * Modelo de las métricas Garmin que el agente puede consultar.
 *
 * Regla central del producto: cada métrica declara si existe o no. Un campo
 * ausente significa "no disponible" y el agente debe decirlo explícitamente en
 * vez de inventarlo. Por eso casi todo es opcional y el snapshot arrastra
 * siempre `dataSource` y `lastSyncAt`.
 */

/** De dónde salen los datos. `mock` obliga a la UI a mostrar el aviso de demo. */
export const dataSourceSchema = z.enum(["mock", "garmin-mcp", "agent-endpoint"]);
export type DataSource = z.infer<typeof dataSourceSchema>;

/** Body de `POST /api/garmin/connect`. La contraseña nunca se persiste en el teléfono. */
export const garminConnectRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type GarminConnectRequest = z.infer<typeof garminConnectRequestSchema>;

export const sleepMetricsSchema = z.object({
  date: z.string(),
  durationMinutes: z.number().optional(),
  score: z.number().min(0).max(100).optional(),
  deepMinutes: z.number().optional(),
  remMinutes: z.number().optional(),
  lightMinutes: z.number().optional(),
  awakeMinutes: z.number().optional(),
  /** Diferencia contra el promedio propio, en minutos. Negativo = dormiste menos. */
  vsAverageMinutes: z.number().optional(),
});

export const hrvMetricsSchema = z.object({
  date: z.string(),
  lastNightAvgMs: z.number().optional(),
  weeklyAvgMs: z.number().optional(),
  baselineLowMs: z.number().optional(),
  baselineHighMs: z.number().optional(),
  status: z.enum(["balanced", "unbalanced", "low", "poor", "unknown"]).optional(),
  /** Desviación porcentual respecto de la línea base. Negativo = bajo la base. */
  vsBaselinePercent: z.number().optional(),
});

export const bodyBatteryMetricsSchema = z.object({
  date: z.string(),
  current: z.number().min(0).max(100).optional(),
  highest: z.number().min(0).max(100).optional(),
  lowest: z.number().min(0).max(100).optional(),
  charged: z.number().optional(),
  drained: z.number().optional(),
});

export const stressMetricsSchema = z.object({
  date: z.string(),
  avgLevel: z.number().min(0).max(100).optional(),
  maxLevel: z.number().min(0).max(100).optional(),
  restMinutes: z.number().optional(),
  lowMinutes: z.number().optional(),
  mediumMinutes: z.number().optional(),
  highMinutes: z.number().optional(),
});

export const trainingReadinessSchema = z.object({
  date: z.string(),
  score: z.number().min(0).max(100).optional(),
  level: z.enum(["LOW", "MODERATE", "HIGH", "MAXIMUM", "UNKNOWN"]).optional(),
  feedback: z.string().optional(),
  sleepScore: z.number().optional(),
  recoveryTimeHours: z.number().optional(),
  acuteLoad: z.number().optional(),
  hrvFactorPercent: z.number().optional(),
});

export const trainingStatusSchema = z.object({
  date: z.string(),
  status: z.string().optional(),
  acuteLoad: z.number().optional(),
  /** Ratio carga aguda / crónica. */
  acwr: z.number().optional(),
  loadRatioFeedback: z.string().optional(),
  weeklyLoad: z.number().optional(),
});

export const activityHrZoneSchema = z.object({
  zone: z.number().int().min(1).max(5),
  minutes: z.number(),
});

export const activitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  startTimeLocal: z.string(),
  durationSeconds: z.number().optional(),
  distanceMeters: z.number().optional(),
  elevationGainMeters: z.number().optional(),
  averageHr: z.number().optional(),
  maxHr: z.number().optional(),
  averagePowerWatts: z.number().optional(),
  normalizedPowerWatts: z.number().optional(),
  calories: z.number().optional(),
  hrZones: z.array(activityHrZoneSchema).optional(),
});

export const weeklyTrendSchema = z.object({
  weekStart: z.string(),
  totalDurationMinutes: z.number().optional(),
  totalDistanceMeters: z.number().optional(),
  totalElevationMeters: z.number().optional(),
  activityCount: z.number().optional(),
  avgSleepMinutes: z.number().optional(),
  avgHrvMs: z.number().optional(),
  avgRestingHr: z.number().optional(),
  avgBodyBattery: z.number().optional(),
});

/**
 * Fotografía completa de lo que el agente vio para responder.
 *
 * `period` y `lastSyncAt` son obligatorios: toda respuesta sobre datos del
 * usuario debe declarar el periodo analizado y cuándo se sincronizó.
 */
export const garminSnapshotSchema = z.object({
  dataSource: dataSourceSchema,
  /** Ej: "2026-07-08 a 2026-08-04 (28 días)". */
  period: z.string(),
  lastSyncAt: z.string(),
  connected: z.boolean(),
  sleep: sleepMetricsSchema.optional(),
  hrv: hrvMetricsSchema.optional(),
  restingHeartRate: z.number().optional(),
  bodyBattery: bodyBatteryMetricsSchema.optional(),
  stress: stressMetricsSchema.optional(),
  trainingReadiness: trainingReadinessSchema.optional(),
  trainingStatus: trainingStatusSchema.optional(),
  vo2max: z.number().optional(),
  fitnessAge: z.number().optional(),
  recentActivities: z.array(activitySchema).default([]),
  weeklyTrends: z.array(weeklyTrendSchema).default([]),
  /** Métricas que se intentaron leer y no existían. El agente debe decirlo. */
  unavailableMetrics: z.array(z.string()).default([]),
});

export type SleepMetrics = z.infer<typeof sleepMetricsSchema>;
export type HrvMetrics = z.infer<typeof hrvMetricsSchema>;
export type BodyBatteryMetrics = z.infer<typeof bodyBatteryMetricsSchema>;
export type StressMetrics = z.infer<typeof stressMetricsSchema>;
export type TrainingReadiness = z.infer<typeof trainingReadinessSchema>;
export type TrainingStatus = z.infer<typeof trainingStatusSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type WeeklyTrend = z.infer<typeof weeklyTrendSchema>;
export type GarminSnapshot = z.infer<typeof garminSnapshotSchema>;

/** Estado de conexión que el encabezado del chat traduce a verde / amarillo / gris. */
export type GarminConnectionStatus = "connected" | "stale" | "demo" | "disconnected";

export interface GarminStatus {
  status: GarminConnectionStatus;
  dataSource: DataSource;
  lastSyncAt?: string;
  message: string;
}

/** Umbral tras el cual los datos se consideran desactualizados. */
export const STALE_SYNC_HOURS = 24;

export const DEMO_NOTICE = "Datos de demostración — Garmin aún no está conectado";

/**
 * Traduce un snapshot al estado que consume el encabezado del chat.
 *
 * `mock` siempre cae en `demo`, sin importar la frescura: nunca se presenta
 * un dato simulado como si fuera real.
 */
export function deriveGarminStatus(snapshot: GarminSnapshot | undefined, now = new Date()): GarminStatus {
  if (!snapshot) {
    return {
      status: "disconnected",
      dataSource: "mock",
      message: "Garmin no conectado",
    };
  }

  if (snapshot.dataSource === "mock") {
    return {
      status: "demo",
      dataSource: "mock",
      lastSyncAt: snapshot.lastSyncAt,
      message: DEMO_NOTICE,
    };
  }

  if (!snapshot.connected) {
    return {
      status: "disconnected",
      dataSource: snapshot.dataSource,
      lastSyncAt: snapshot.lastSyncAt,
      message: "Garmin no conectado",
    };
  }

  const syncedAt = new Date(snapshot.lastSyncAt);
  const hoursAgo = (now.getTime() - syncedAt.getTime()) / 3_600_000;

  if (!Number.isFinite(hoursAgo) || hoursAgo > STALE_SYNC_HOURS) {
    return {
      status: "stale",
      dataSource: snapshot.dataSource,
      lastSyncAt: snapshot.lastSyncAt,
      message: "Datos Garmin desactualizados",
    };
  }

  return {
    status: "connected",
    dataSource: snapshot.dataSource,
    lastSyncAt: snapshot.lastSyncAt,
    message: "Garmin conectado",
  };
}
