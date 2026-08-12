import type { HeartRateSample } from "../types/garmin-time-series";
import type { ExercisePhysiologyDataQuality, ExercisePhysiologySummary } from "../types/exercise-physiology";

/**
 * Umbrales centralizados para clasificar `dataQuality`, en vez de dispersos
 * por el código — mismo criterio que `training/performance-snapshot-quality.ts`.
 *
 * Garmin típicamente entrega FC cada pocos segundos durante una actividad;
 * `expectedSampleIntervalSeconds` es deliberadamente conservador (una muestra
 * cada 10s) para no exigir más densidad de la que el dispositivo del usuario
 * pueda dar. La cobertura es `muestras reales / muestras esperadas al ese
 * intervalo` sobre la duración real del ejercicio.
 */
export const PHYSIOLOGY_QUALITY_THRESHOLDS = {
  /** Menos de esto no permite ningún promedio responsable. */
  minSamplesForLimited: 2,
  expectedSampleIntervalSeconds: 10,
  /** Cobertura mínima para considerarse "good" en vez de "limited". */
  minCoverageRatioForGood: 0.5,
} as const;

function classifyDataQuality(sampleCount: number, durationSeconds: number): ExercisePhysiologyDataQuality {
  if (sampleCount < PHYSIOLOGY_QUALITY_THRESHOLDS.minSamplesForLimited) return "insufficient";
  const expectedSamples = durationSeconds / PHYSIOLOGY_QUALITY_THRESHOLDS.expectedSampleIntervalSeconds;
  const coverage = expectedSamples > 0 ? sampleCount / expectedSamples : 1;
  return coverage >= PHYSIOLOGY_QUALITY_THRESHOLDS.minCoverageRatioForGood ? "good" : "limited";
}

/**
 * Cruza el intervalo real de un ejercicio contra las muestras de FC de la
 * actividad Garmin vinculada.
 *
 * Filtra estrictamente `startedAt <= muestra <= completedAt`, sin buffers
 * ocultos. Nunca reparte Training Effect ni calorías de la actividad completa
 * (esos campos ni siquiera se reciben acá). La recuperación post-ejercicio de
 * 60s sólo se calcula si no se superpone con el siguiente ejercicio.
 */
export function computeExercisePhysiology(params: {
  exerciseExecutionId: string;
  garminActivityId: string;
  intervalStartedAt: string;
  intervalCompletedAt: string;
  /** Todas las muestras de la actividad — la función filtra al intervalo, el llamador no necesita recortarlas antes. */
  samples: HeartRateSample[];
  perceivedEffort?: number;
  /** Si el siguiente ejercicio empieza antes de que termine la ventana de recuperación, ésta no se calcula. */
  nextExerciseStartedAt?: string;
  calculatedAt: string;
}): ExercisePhysiologySummary {
  const start = new Date(params.intervalStartedAt).getTime();
  const end = new Date(params.intervalCompletedAt).getTime();
  const durationSeconds = Math.max(0, (end - start) / 1000);

  const inInterval = params.samples
    .filter((sample) => {
      const t = new Date(sample.timestamp).getTime();
      return t >= start && t <= end && typeof sample.heartRate === "number";
    })
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const heartRates = inInterval.map((sample) => sample.heartRate as number);
  const sampleCount = inInterval.length;
  const dataQuality = classifyDataQuality(sampleCount, durationSeconds);

  const averageHeartRate = heartRates.length
    ? Math.round(heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length)
    : undefined;
  const minimumHeartRate = heartRates.length ? Math.min(...heartRates) : undefined;
  const maximumHeartRate = heartRates.length ? Math.max(...heartRates) : undefined;
  const heartRateAtStart = heartRates[0];
  const heartRateAtEnd = heartRates[heartRates.length - 1];
  const heartRateChange =
    heartRateAtStart !== undefined && heartRateAtEnd !== undefined ? heartRateAtEnd - heartRateAtStart : undefined;

  const recoveryWindowEnd = end + 60_000;
  const nextStart = params.nextExerciseStartedAt ? new Date(params.nextExerciseStartedAt).getTime() : undefined;
  const recoveryWindowIsFree = nextStart === undefined || nextStart >= recoveryWindowEnd;

  let postExerciseRecovery: ExercisePhysiologySummary["postExerciseRecovery"];
  if (heartRateAtEnd !== undefined && recoveryWindowIsFree) {
    const windowSamples = params.samples.filter((sample) => {
      const t = new Date(sample.timestamp).getTime();
      return t > end && t <= recoveryWindowEnd && typeof sample.heartRate === "number";
    });
    const last = windowSamples[windowSamples.length - 1];
    if (last?.heartRate !== undefined) {
      postExerciseRecovery = {
        heartRateAtEnd,
        heartRateAfter60Seconds: last.heartRate,
        decrease: heartRateAtEnd - last.heartRate,
      };
    }
  }

  return {
    id: `${params.exerciseExecutionId}-physio`,
    exerciseExecutionId: params.exerciseExecutionId,
    garminActivityId: params.garminActivityId,
    intervalStartedAt: params.intervalStartedAt,
    intervalCompletedAt: params.intervalCompletedAt,
    durationSeconds,
    sampleCount,
    dataQuality,
    averageHeartRate,
    minimumHeartRate,
    maximumHeartRate,
    heartRateAtStart,
    heartRateAtEnd,
    heartRateChange,
    postExerciseRecovery,
    perceivedEffort: params.perceivedEffort,
    calculatedAt: params.calculatedAt,
  };
}
