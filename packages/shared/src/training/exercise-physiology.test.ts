import { describe, expect, it } from "vitest";
import type { HeartRateSample } from "../types/garmin-time-series";
import { computeExercisePhysiology, PHYSIOLOGY_QUALITY_THRESHOLDS } from "./exercise-physiology";

/** Una muestra cada 10s entre `start` y `end` (inclusive), con FC dada por `heartRateAt`. */
function denseSamples(start: string, end: string, heartRateAt: (progress: number) => number): HeartRateSample[] {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const samples: HeartRateSample[] = [];
  for (let t = startMs; t <= endMs; t += 10_000) {
    const progress = (t - startMs) / (endMs - startMs);
    samples.push({ timestamp: new Date(t).toISOString(), heartRate: Math.round(heartRateAt(progress)) });
  }
  return samples;
}

describe("computeExercisePhysiology", () => {
  it("filtra estrictamente al intervalo [startedAt, completedAt], sin buffers ocultos", () => {
    const samples: HeartRateSample[] = [
      { timestamp: "2026-08-05T23:11:59.000Z", heartRate: 999 }, // justo antes: no debe contar
      { timestamp: "2026-08-05T23:12:00.000Z", heartRate: 100 },
      { timestamp: "2026-08-05T23:14:00.000Z", heartRate: 110 },
      { timestamp: "2026-08-05T23:16:00.000Z", heartRate: 112 },
      { timestamp: "2026-08-05T23:16:01.000Z", heartRate: 999 }, // justo después: no debe contar
    ];

    const summary = computeExercisePhysiology({
      exerciseExecutionId: "ex1",
      garminActivityId: "act1",
      intervalStartedAt: "2026-08-05T23:12:00.000Z",
      intervalCompletedAt: "2026-08-05T23:16:00.000Z",
      samples,
      calculatedAt: "2026-08-06T00:00:00.000Z",
    });

    expect(summary.sampleCount).toBe(3);
    expect(summary.averageHeartRate).toBe(Math.round((100 + 110 + 112) / 3));
    expect(summary.minimumHeartRate).toBe(100);
    expect(summary.maximumHeartRate).toBe(112);
    expect(summary.heartRateAtStart).toBe(100);
    expect(summary.heartRateAtEnd).toBe(112);
    expect(summary.heartRateChange).toBe(12);
  });

  it("calcula la duración del intervalo en segundos", () => {
    const summary = computeExercisePhysiology({
      exerciseExecutionId: "ex1",
      garminActivityId: "act1",
      intervalStartedAt: "2026-08-05T23:18:00.000Z",
      intervalCompletedAt: "2026-08-05T23:24:00.000Z",
      samples: [],
      calculatedAt: "2026-08-06T00:00:00.000Z",
    });
    expect(summary.durationSeconds).toBe(360);
  });

  it("clasifica dataQuality como 'good' con cobertura densa", () => {
    const samples = denseSamples("2026-08-05T23:12:00.000Z", "2026-08-05T23:16:00.000Z", () => 100);
    const summary = computeExercisePhysiology({
      exerciseExecutionId: "ex1",
      garminActivityId: "act1",
      intervalStartedAt: "2026-08-05T23:12:00.000Z",
      intervalCompletedAt: "2026-08-05T23:16:00.000Z",
      samples,
      calculatedAt: "2026-08-06T00:00:00.000Z",
    });
    expect(summary.dataQuality).toBe("good");
  });

  it("clasifica dataQuality como 'limited' con pocas muestras dispersas", () => {
    const summary = computeExercisePhysiology({
      exerciseExecutionId: "ex1",
      garminActivityId: "act1",
      intervalStartedAt: "2026-08-05T23:12:00.000Z",
      intervalCompletedAt: "2026-08-05T23:16:00.000Z", // 240s
      samples: [
        { timestamp: "2026-08-05T23:12:30.000Z", heartRate: 100 },
        { timestamp: "2026-08-05T23:15:30.000Z", heartRate: 110 },
      ],
      calculatedAt: "2026-08-06T00:00:00.000Z",
    });
    expect(summary.dataQuality).toBe("limited");
  });

  it("clasifica dataQuality como 'insufficient' con menos del mínimo de muestras", () => {
    const summary = computeExercisePhysiology({
      exerciseExecutionId: "ex1",
      garminActivityId: "act1",
      intervalStartedAt: "2026-08-05T23:12:00.000Z",
      intervalCompletedAt: "2026-08-05T23:16:00.000Z",
      samples: [{ timestamp: "2026-08-05T23:13:00.000Z", heartRate: 100 }],
      calculatedAt: "2026-08-06T00:00:00.000Z",
    });
    expect(summary.dataQuality).toBe("insufficient");
    expect(summary.sampleCount).toBe(1);
    expect(summary.sampleCount).toBeLessThan(PHYSIOLOGY_QUALITY_THRESHOLDS.minSamplesForLimited);
  });

  it("no reparte Training Effect ni calorías: el resultado no tiene esos campos", () => {
    const summary = computeExercisePhysiology({
      exerciseExecutionId: "ex1",
      garminActivityId: "act1",
      intervalStartedAt: "2026-08-05T23:12:00.000Z",
      intervalCompletedAt: "2026-08-05T23:16:00.000Z",
      samples: [],
      calculatedAt: "2026-08-06T00:00:00.000Z",
    });
    expect(summary).not.toHaveProperty("aerobicTrainingEffect");
    expect(summary).not.toHaveProperty("calories");
  });

  it("calcula recuperación de 60s cuando no se superpone con el siguiente ejercicio", () => {
    const summary = computeExercisePhysiology({
      exerciseExecutionId: "ex1",
      garminActivityId: "act1",
      intervalStartedAt: "2026-08-05T23:18:00.000Z",
      intervalCompletedAt: "2026-08-05T23:24:00.000Z",
      samples: [
        { timestamp: "2026-08-05T23:23:50.000Z", heartRate: 170 },
        { timestamp: "2026-08-05T23:24:00.000Z", heartRate: 165 },
        { timestamp: "2026-08-05T23:24:45.000Z", heartRate: 140 },
        { timestamp: "2026-08-05T23:25:00.000Z", heartRate: 130 }, // exactamente a los 60s
      ],
      nextExerciseStartedAt: "2026-08-05T23:27:00.000Z", // hay margen de sobra
      calculatedAt: "2026-08-06T00:00:00.000Z",
    });
    expect(summary.postExerciseRecovery).toEqual({
      heartRateAtEnd: 165,
      heartRateAfter60Seconds: 130,
      decrease: 35,
    });
  });

  it("no calcula recuperación si se superpone con el siguiente ejercicio", () => {
    const summary = computeExercisePhysiology({
      exerciseExecutionId: "ex1",
      garminActivityId: "act1",
      intervalStartedAt: "2026-08-05T23:18:00.000Z",
      intervalCompletedAt: "2026-08-05T23:24:00.000Z",
      samples: [
        { timestamp: "2026-08-05T23:24:00.000Z", heartRate: 165 },
        { timestamp: "2026-08-05T23:24:30.000Z", heartRate: 150 },
      ],
      nextExerciseStartedAt: "2026-08-05T23:24:20.000Z", // el siguiente empieza antes de completar los 60s
      calculatedAt: "2026-08-06T00:00:00.000Z",
    });
    expect(summary.postExerciseRecovery).toBeUndefined();
  });

  it("mantiene el RPE ingresado por el usuario separado de las métricas Garmin", () => {
    const summary = computeExercisePhysiology({
      exerciseExecutionId: "ex1",
      garminActivityId: "act1",
      intervalStartedAt: "2026-08-05T23:12:00.000Z",
      intervalCompletedAt: "2026-08-05T23:16:00.000Z",
      samples: [],
      perceivedEffort: 8,
      calculatedAt: "2026-08-06T00:00:00.000Z",
    });
    expect(summary.perceivedEffort).toBe(8);
  });
});
