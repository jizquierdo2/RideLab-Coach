import type { DataQuality, PerformanceSnapshot } from "../types/performance";

/**
 * Deriva `dataQuality` y `missingMetrics` a partir de qué métricas vinieron
 * presentes en la respuesta de Garmin. Vive en `shared` para que el backend
 * (`apps/server/src/garmin/mcp.ts` y `mock.ts`) arme el `PerformanceSnapshot`
 * completo antes de devolverlo — nunca se inventa un valor para rellenar un
 * hueco, sólo se declara qué falta.
 */

type SnapshotFields = Pick<
  PerformanceSnapshot,
  | "trainingReadiness"
  | "sleep"
  | "hrv"
  | "bodyBattery"
  | "restingHeartRate"
  | "stress"
  | "recovery"
  | "acuteLoad"
  | "trainingStatus"
  | "vo2Max"
>;

const CORE: Array<[keyof SnapshotFields, string]> = [
  ["trainingReadiness", "Training Readiness"],
  ["sleep", "Sueño"],
  ["hrv", "HRV"],
  ["bodyBattery", "Body Battery"],
];

const SECONDARY: Array<[keyof SnapshotFields, string]> = [
  ["restingHeartRate", "Frecuencia cardíaca en reposo"],
  ["stress", "Estrés"],
  ["recovery", "Tiempo de recuperación"],
  ["acuteLoad", "Carga aguda"],
  ["trainingStatus", "Estado de entrenamiento"],
  ["vo2Max", "VO2 Max"],
];

export function derivePerformanceDataQuality(fields: SnapshotFields): {
  dataQuality: DataQuality;
  missingMetrics: string[];
} {
  const missingMetrics: string[] = [];
  let missingCore = 0;
  let presentSecondary = 0;

  for (const [key, label] of CORE) {
    if (fields[key] === undefined) {
      missingMetrics.push(label);
      missingCore += 1;
    }
  }
  for (const [key, label] of SECONDARY) {
    if (fields[key] === undefined) missingMetrics.push(label);
    else presentSecondary += 1;
  }

  let dataQuality: DataQuality;
  if (missingCore === 0) {
    dataQuality = "complete";
  } else if (fields.trainingReadiness !== undefined || presentSecondary >= 2) {
    dataQuality = "partial";
  } else {
    dataQuality = "insufficient";
  }

  return { dataQuality, missingMetrics };
}
