import type { GarminSnapshot } from "../types/garmin";
import type { PerformanceSnapshot } from "../types/performance";
import { derivePerformanceDataQuality } from "./performance-snapshot-quality";

/**
 * Deriva un `PerformanceSnapshot` desde un `GarminSnapshot` ya resuelto.
 *
 * Puro (sin I/O) a propósito: así `McpGarminDataProvider.getPerformanceSnapshot()`
 * sólo tiene que llamar `getSnapshot()` (que ya hace las 8 llamadas paralelas
 * al MCP) y pasar el resultado por acá, sin abrir una segunda conexión ni
 * pedir tools nuevas — y el mapeo queda testeable sin spawnear el proceso MCP
 * real. `optimalLow`/`optimalHigh` de `acuteLoad` y `loadFocus` quedan
 * `undefined` a propósito: Garmin no los entrega en estas tools, y no se
 * fabrican.
 */
export function mapGarminSnapshotToPerformanceSnapshot(
  snapshot: GarminSnapshot,
  reference = new Date(),
): PerformanceSnapshot {
  const trainingReadiness = snapshot.trainingReadiness
    ? { score: snapshot.trainingReadiness.score, status: snapshot.trainingReadiness.level }
    : undefined;

  const sleep = snapshot.sleep
    ? {
        durationMinutes: snapshot.sleep.durationMinutes,
        score: snapshot.sleep.score,
        baselineDurationMinutes:
          snapshot.sleep.durationMinutes !== undefined && snapshot.sleep.vsAverageMinutes !== undefined
            ? snapshot.sleep.durationMinutes - snapshot.sleep.vsAverageMinutes
            : undefined,
      }
    : undefined;

  const hrv = snapshot.hrv
    ? {
        overnightAverage: snapshot.hrv.lastNightAvgMs,
        baselineLow: snapshot.hrv.baselineLowMs,
        baselineHigh: snapshot.hrv.baselineHighMs,
        status: snapshot.hrv.status,
      }
    : undefined;

  const bodyBattery = snapshot.bodyBattery
    ? { current: snapshot.bodyBattery.current, chargedDuringSleep: snapshot.bodyBattery.charged }
    : undefined;

  const restingHeartRate = snapshot.restingHeartRate !== undefined ? { value: snapshot.restingHeartRate } : undefined;

  const stress = snapshot.stress ? { average: snapshot.stress.avgLevel } : undefined;

  const recovery =
    snapshot.trainingReadiness?.recoveryTimeHours !== undefined
      ? { remainingHours: snapshot.trainingReadiness.recoveryTimeHours }
      : undefined;

  const acuteLoad = snapshot.trainingStatus
    ? { value: snapshot.trainingStatus.acuteLoad, status: snapshot.trainingStatus.loadRatioFeedback }
    : undefined;

  const vo2Max = snapshot.vo2max !== undefined ? { value: snapshot.vo2max } : undefined;

  const recentActivities = snapshot.recentActivities
    .filter((activity): activity is typeof activity & { durationSeconds: number } => activity.durationSeconds !== undefined)
    .slice(0, 5)
    .map((activity) => ({
      id: activity.id,
      type: activity.type,
      startedAt: activity.startTimeLocal.replace(" ", "T"),
      durationMinutes: Math.round(activity.durationSeconds / 60),
    }));

  const { dataQuality, missingMetrics } = derivePerformanceDataQuality({
    trainingReadiness,
    sleep,
    hrv,
    bodyBattery,
    restingHeartRate,
    stress,
    recovery,
    acuteLoad,
    trainingStatus: snapshot.trainingStatus?.status,
    vo2Max,
  });

  return {
    id: `perf-${reference.getTime()}`,
    capturedAt: reference.toISOString(),
    source: "garmin",
    dataQuality,
    trainingReadiness,
    sleep,
    hrv,
    bodyBattery,
    restingHeartRate,
    stress,
    recovery,
    acuteLoad,
    trainingStatus: snapshot.trainingStatus?.status,
    vo2Max,
    recentActivities: recentActivities.length ? recentActivities : undefined,
    missingMetrics,
  };
}
