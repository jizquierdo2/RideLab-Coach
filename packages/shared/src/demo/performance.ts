import type { PerformanceSnapshot } from "../types/performance";

/**
 * Dos escenarios demo pedidos explícitamente: uno "Sólido" (para el flujo
 * feliz) y uno "Recuperar" (para probar el camino de carga alta / baja
 * recuperación). Ambos con `source: "mock"` y `dataQuality: "complete"` —
 * nunca se presentan como datos reales.
 */

export function buildDemoPerformanceSnapshotSolid(reference = new Date()): PerformanceSnapshot {
  return {
    id: "demo-performance-solid",
    capturedAt: reference.toISOString(),
    source: "mock",
    dataQuality: "complete",
    trainingReadiness: { score: 68, status: "MODERATE" },
    sleep: { durationMinutes: 432, score: 81, baselineDurationMinutes: 420, status: "Reparador" },
    hrv: { overnightAverage: 52, baselineLow: 44, baselineHigh: 58, status: "balanced" },
    bodyBattery: { current: 72, chargedDuringSleep: 68 },
    restingHeartRate: { value: 50, baseline: 52 },
    stress: { average: 24, status: "Bajo" },
    recovery: { remainingHours: 8 },
    acuteLoad: { value: 268, optimalLow: 200, optimalHigh: 320, status: "Óptima" },
    trainingStatus: "PRODUCTIVE",
    loadFocus: { lowAerobic: 45, highAerobic: 35, anaerobic: 20 },
    vo2Max: { value: 47, trend: "stable" },
    intensityMinutes: 145,
    recentActivities: [
      { id: "demo-perf-act-1", type: "mountain_biking", startedAt: reference.toISOString(), durationMinutes: 84, trainingEffect: 3.1 },
    ],
    missingMetrics: [],
  };
}

export function buildDemoPerformanceSnapshotRecover(reference = new Date()): PerformanceSnapshot {
  return {
    id: "demo-performance-recover",
    capturedAt: reference.toISOString(),
    source: "mock",
    dataQuality: "complete",
    trainingReadiness: { score: 36, status: "LOW" },
    sleep: { durationMinutes: 358, score: 52, baselineDurationMinutes: 420, status: "Insuficiente" },
    hrv: { overnightAverage: 38, baselineLow: 44, baselineHigh: 58, status: "low" },
    bodyBattery: { current: 34, chargedDuringSleep: 30 },
    restingHeartRate: { value: 58, baseline: 52 },
    stress: { average: 61, status: "Alto" },
    recovery: { remainingHours: 28 },
    acuteLoad: { value: 402, optimalLow: 200, optimalHigh: 320, status: "Alta" },
    trainingStatus: "OVERREACHING",
    loadFocus: { lowAerobic: 20, highAerobic: 30, anaerobic: 50 },
    vo2Max: { value: 46, trend: "down" },
    intensityMinutes: 210,
    recentActivities: [
      { id: "demo-perf-act-2", type: "strength_training", startedAt: reference.toISOString(), durationMinutes: 62, trainingEffect: 4.2 },
    ],
    missingMetrics: [],
  };
}
