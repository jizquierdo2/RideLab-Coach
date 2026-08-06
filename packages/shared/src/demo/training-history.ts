import { DEMO_PLAN_ID } from "./plan";
import type { GarminActivity, SessionExecution } from "../types/training-history";

/**
 * Escenario demo fijo del 5 de agosto de 2026 (hora de Santiago, UTC-4 en
 * invierno), pedido explícitamente para ejercitar el matcher: una sesión
 * "Potencia de Empuje e Impacto" del plan demo, iniciada y finalizada en la
 * app, más la actividad Garmin correspondiente — que Garmin sólo etiqueta como
 * "Cardio", sin ninguna relación de nombre con la sesión. `scoreMatch` debe
 * clasificar este par como alta confianza igual.
 *
 * "Sesión planificada pendiente" y "sesión omitida" no requieren datos acá:
 * son estados que ya existen sin ejecución (pendiente) o vía
 * `sessionStatusRepository` (omitida) — se siembran en la app, no en este
 * builder puro. Esto sólo modela ejecuciones y actividades Garmin.
 */

/** Ejecución real de `w1-d1` (10 ejercicios, 60 min planificados) del plan demo. */
export function buildDemoSessionExecution(): SessionExecution {
  return {
    id: "demo-exec-w1-d1",
    plannedSessionId: "w1-d1",
    startedAt: "2026-08-05T23:04:00.000Z", // 19:04 hora de Santiago
    finishedAt: "2026-08-06T00:04:00.000Z", // 20:04 hora de Santiago
    status: "completed",
    actualRpe: 7,
    painLevel: 0,
  };
}

/** Actividad Garmin que corresponde a la ejecución anterior, sólo bajo el tipo "Cardio". */
export function buildDemoMatchingActivity(): GarminActivity {
  return {
    id: "demo-act-cardio-w1-d1",
    name: "Cardio",
    activityType: "cardio",
    startedAt: "2026-08-05T23:08:00.000Z", // 19:08 hora de Santiago
    durationSeconds: 3492, // 58 min 12 s
    calories: 612,
    averageHeartRate: 142,
    maxHeartRate: 174,
    aerobicTrainingEffect: 3.2,
    anaerobicTrainingEffect: 1.6,
    syncedAt: "2026-08-06T01:00:00.000Z",
  };
}

/** Salida de MTB libre, sin ninguna sesión planificada asociada. */
export function buildDemoFreeRideActivity(): GarminActivity {
  return {
    id: "demo-act-free-ride",
    name: "Las Condes — salida libre",
    activityType: "cycling",
    startedAt: "2026-08-03T15:00:00.000Z",
    durationSeconds: 5400,
    distanceMeters: 24500,
    elevationGainMeters: 610,
    averageHeartRate: 138,
    maxHeartRate: 168,
    calories: 780,
    syncedAt: "2026-08-03T19:00:00.000Z",
  };
}

/** Actividad Garmin sin vincular: cae fuera de la ventana de cualquier ejecución. */
export function buildDemoUnlinkedActivity(): GarminActivity {
  return {
    id: "demo-act-unlinked",
    name: "Strength",
    activityType: "strength_training",
    startedAt: "2026-08-04T22:00:00.000Z",
    durationSeconds: 2700,
    averageHeartRate: 118,
    calories: 340,
    syncedAt: "2026-08-04T23:30:00.000Z",
  };
}

export function buildDemoTrainingHistory(): {
  planId: typeof DEMO_PLAN_ID;
  executions: SessionExecution[];
  activities: GarminActivity[];
} {
  return {
    planId: DEMO_PLAN_ID,
    executions: [buildDemoSessionExecution()],
    activities: [buildDemoMatchingActivity(), buildDemoFreeRideActivity(), buildDemoUnlinkedActivity()],
  };
}
