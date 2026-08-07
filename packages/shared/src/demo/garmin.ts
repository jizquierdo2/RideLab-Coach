import type { GarminSnapshot, HistoricalMetricsDay } from "../types/garmin";

/**
 * Snapshot de demostración.
 *
 * Siempre lleva `dataSource: "mock"`, lo que obliga a la UI a mostrar el aviso
 * "Datos de demostración — Garmin aún no está conectado". Incluye a propósito
 * un par de métricas en `unavailableMetrics` para ejercitar el camino en que el
 * agente debe declarar que un dato no existe en vez de inventarlo.
 */

function isoDay(offsetDays: number, reference: Date): string {
  const date = new Date(reference);
  date.setDate(date.getDate() - offsetDays);
  return date.toISOString().slice(0, 10);
}

export function buildDemoSnapshot(reference = new Date()): GarminSnapshot {
  const today = isoDay(0, reference);
  const lastSync = new Date(reference.getTime() - 2 * 3_600_000).toISOString();

  return {
    dataSource: "mock",
    period: `${isoDay(27, reference)} a ${today} (28 días)`,
    lastSyncAt: lastSync,
    connected: false,
    sleep: {
      date: today,
      durationMinutes: 402,
      score: 71,
      deepMinutes: 58,
      remMinutes: 76,
      lightMinutes: 249,
      awakeMinutes: 19,
      vsAverageMinutes: -46,
    },
    hrv: {
      date: today,
      lastNightAvgMs: 41,
      weeklyAvgMs: 44,
      baselineLowMs: 42,
      baselineHighMs: 58,
      status: "unbalanced",
      vsBaselinePercent: -8,
    },
    restingHeartRate: 52,
    bodyBattery: {
      date: today,
      current: 61,
      highest: 78,
      lowest: 24,
      charged: 54,
      drained: 71,
    },
    stress: {
      date: today,
      avgLevel: 34,
      maxLevel: 82,
      restMinutes: 412,
      lowMinutes: 508,
      mediumMinutes: 214,
      highMinutes: 47,
    },
    trainingReadiness: {
      date: today,
      score: 62,
      level: "MODERATE",
      feedback: "Recuperación parcial: dormiste menos que tu promedio",
      sleepScore: 71,
      recoveryTimeHours: 18,
      acuteLoad: 271,
      hrvFactorPercent: 74,
    },
    trainingStatus: {
      date: today,
      status: "PRODUCTIVE",
      acuteLoad: 271,
      acwr: 1.12,
      loadRatioFeedback: "Carga dentro del rango óptimo",
      weeklyLoad: 412,
    },
    vo2max: 47,
    fitnessAge: 32,
    dailyActivity: {
      date: today,
      steps: 6420,
      stepGoal: 8000,
      floorsAscended: 9,
      intensityMinutesModerate: 38,
      intensityMinutesVigorous: 22,
      intensityMinutesGoal: 150,
    },
    hillScore: 58,
    enduranceScore: 5420,
    cyclingFtpWatts: 214,
    lactateThresholdBpm: 168,
    recentActivities: [
      {
        id: "demo-act-1",
        name: "Las Condes — salida de MTB",
        type: "mountain_biking",
        startTimeLocal: `${isoDay(2, reference)} 14:52:54`,
        durationSeconds: 5047,
        distanceMeters: 15961,
        elevationGainMeters: 486,
        averageHr: 138,
        maxHr: 171,
        averagePowerWatts: 172,
        normalizedPowerWatts: 198,
        calories: 742,
        hrZones: [
          { zone: 1, minutes: 18 },
          { zone: 2, minutes: 32 },
          { zone: 3, minutes: 21 },
          { zone: 4, minutes: 12 },
          { zone: 5, minutes: 1 },
        ],
      },
      {
        id: "demo-act-2",
        name: "Rodado suave por el parque",
        type: "cycling",
        startTimeLocal: `${isoDay(5, reference)} 08:12:00`,
        durationSeconds: 3320,
        distanceMeters: 21400,
        elevationGainMeters: 138,
        averageHr: 121,
        maxHr: 149,
        calories: 468,
      },
      {
        id: "demo-act-3",
        name: "Fuerza en gimnasio",
        type: "strength_training",
        startTimeLocal: `${isoDay(6, reference)} 19:05:00`,
        durationSeconds: 3180,
        averageHr: 112,
        maxHr: 148,
        calories: 312,
      },
    ],
    weeklyTrends: [
      {
        weekStart: isoDay(27, reference),
        totalDurationMinutes: 214,
        totalDistanceMeters: 58200,
        totalElevationMeters: 940,
        activityCount: 4,
        avgSleepMinutes: 448,
        avgHrvMs: 47,
        avgRestingHr: 51,
        avgBodyBattery: 72,
      },
      {
        weekStart: isoDay(20, reference),
        totalDurationMinutes: 262,
        totalDistanceMeters: 71800,
        totalElevationMeters: 1180,
        activityCount: 5,
        avgSleepMinutes: 441,
        avgHrvMs: 46,
        avgRestingHr: 51,
        avgBodyBattery: 70,
      },
      {
        weekStart: isoDay(13, reference),
        totalDurationMinutes: 188,
        totalDistanceMeters: 49100,
        totalElevationMeters: 760,
        activityCount: 3,
        avgSleepMinutes: 425,
        avgHrvMs: 45,
        avgRestingHr: 52,
        avgBodyBattery: 66,
      },
      {
        weekStart: isoDay(6, reference),
        totalDurationMinutes: 205,
        totalDistanceMeters: 37400,
        totalElevationMeters: 624,
        activityCount: 3,
        avgSleepMinutes: 408,
        avgHrvMs: 44,
        avgRestingHr: 52,
        avgBodyBattery: 61,
      },
    ],
    // Métricas que este perfil demo no expone: el agente debe decirlo, no suponerlas.
    unavailableMetrics: ["SpO2 nocturno", "Frecuencia respiratoria", "Potencia por zonas"],
  };
}

/** Resumen diario demo para el rango pedido, usado por `get_historical_metrics` en modo mock. */
export function buildDemoHistoricalMetrics(startDate: string, endDate: string): HistoricalMetricsDay[] {
  const days: HistoricalMetricsDay[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  let index = 0;

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    days.push({
      date,
      sleepScore: 68 + ((index * 7) % 20),
      sleepDurationMinutes: 380 + ((index * 11) % 60),
      hrvOvernightAvgMs: 38 + ((index * 3) % 12),
      hrvStatus: index % 3 === 0 ? "balanced" : "unbalanced",
      trainingReadinessScore: 55 + ((index * 5) % 30),
      stressAvgLevel: 25 + ((index * 4) % 25),
    });
    cursor.setDate(cursor.getDate() + 1);
    index += 1;
  }

  return days;
}
