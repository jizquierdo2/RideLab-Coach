import type { ActivityTimeSeries, HeartRateSample } from "../types/garmin-time-series";

/**
 * Serie sintética de FC para `demo-act-cardio-w1-d1` (la actividad demo que
 * ya cruza con `buildDemoSessionExecution()`), muestreada cada 15s desde su
 * inicio (19:08 hora de Santiago) hasta su fin. Cubre los 3 intervalos de
 * `buildDemoExerciseExecutions()` (90/90, Box Jump, Sentadilla Goblet) con
 * una curva de esfuerzo por segmento (rampa → sostenido → baja), más los
 * huecos de descanso entre ejercicios a FC más baja — sirve para ejercitar
 * `computeExercisePhysiology()` en desarrollo y en la demo, no representa
 * lecturas reales.
 */

const ACTIVITY_START = "2026-08-05T23:08:00.000Z";
const ACTIVITY_END = "2026-08-06T00:04:00.000Z"; // 3492s de duración, igual que buildDemoMatchingActivity()
const SAMPLE_INTERVAL_MS = 15_000;

interface Segment {
  startIso: string;
  endIso: string;
  baseline: number;
  peak: number;
}

/** Rampa hacia `peak` el primer 30%, sostiene cerca del peak el 50% central, baja el 20% final. */
function heartRateAt(progress: number, baseline: number, peak: number): number {
  if (progress < 0.3) return baseline + (peak - baseline) * (progress / 0.3);
  if (progress < 0.8) return peak - 3 + Math.sin(progress * 20) * 3;
  return peak - (peak - baseline) * 0.3 * ((progress - 0.8) / 0.2);
}

function buildSegment({ startIso, endIso, baseline, peak }: Segment): HeartRateSample[] {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const samples: HeartRateSample[] = [];

  for (let t = start; t < end; t += SAMPLE_INTERVAL_MS) {
    const progress = (t - start) / (end - start);
    samples.push({ timestamp: new Date(t).toISOString(), heartRate: Math.round(heartRateAt(progress, baseline, peak)) });
  }

  // Un pico breve real cerca de la mitad del segmento, sin desplazar demasiado el promedio.
  const midpointIndex = Math.floor(samples.length / 2);
  if (samples[midpointIndex]) samples[midpointIndex] = { ...samples[midpointIndex], heartRate: peak };

  return samples;
}

export function buildDemoActivityHeartRateSamples(): HeartRateSample[] {
  const segments: Segment[] = [
    // Calentamiento antes del primer ejercicio.
    { startIso: ACTIVITY_START, endIso: "2026-08-05T23:12:00.000Z", baseline: 92, peak: 100 },
    // 90/90 de cadera (19:12-19:16): suave, RPE 3.
    { startIso: "2026-08-05T23:12:00.000Z", endIso: "2026-08-05T23:16:00.000Z", baseline: 96, peak: 112 },
    // Descanso.
    { startIso: "2026-08-05T23:16:00.000Z", endIso: "2026-08-05T23:18:00.000Z", baseline: 100, peak: 106 },
    // Box Jump (19:18-19:24): exigente, RPE 8.
    { startIso: "2026-08-05T23:18:00.000Z", endIso: "2026-08-05T23:24:00.000Z", baseline: 115, peak: 171 },
    // Descanso.
    { startIso: "2026-08-05T23:24:00.000Z", endIso: "2026-08-05T23:27:00.000Z", baseline: 140, peak: 118 },
    // Sentadilla Goblet (19:27-19:35): moderado-alto, RPE 7.
    { startIso: "2026-08-05T23:27:00.000Z", endIso: "2026-08-05T23:35:00.000Z", baseline: 118, peak: 158 },
    // Resto de la actividad, bajando hacia el enfriamiento.
    { startIso: "2026-08-05T23:35:00.000Z", endIso: ACTIVITY_END, baseline: 130, peak: 95 },
  ];

  return segments.flatMap(buildSegment);
}

/** Serie completa para `demo-act-cardio-w1-d1`, lista para `MockGarminDataProvider.getActivityDetails()`. */
export function buildDemoActivityTimeSeries(): ActivityTimeSeries {
  return {
    activityId: "demo-act-cardio-w1-d1",
    source: "mock",
    sampleIntervalSeconds: 15,
    samples: buildDemoActivityHeartRateSamples(),
    availableMetrics: ["heartRate"],
  };
}
