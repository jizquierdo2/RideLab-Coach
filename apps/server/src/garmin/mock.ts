import {
  buildDemoActivityTimeSeries,
  buildDemoHistoricalMetrics,
  buildDemoPerformanceSnapshotSolid,
  buildDemoSnapshot,
  buildDemoTrainingHistory,
  type ActivityTimeSeries,
  type GarminActivity,
  type GarminSnapshot,
  type HistoricalMetricsDay,
  type PerformanceSnapshot,
} from "@ridelab/shared";
import type { GarminDataProvider } from "./provider";

/**
 * Proveedor de datos simulados.
 *
 * El snapshot que devuelve lleva `dataSource: "mock"` y `connected: false`, lo
 * que hace que la app muestre siempre "Datos de demostración — Garmin aún no
 * está conectado". No hay forma de que estos datos se presenten como reales.
 */
export class MockGarminDataProvider implements GarminDataProvider {
  readonly name = "MockGarminDataProvider";

  async getSnapshot(days = 28): Promise<GarminSnapshot> {
    const snapshot = buildDemoSnapshot();
    return {
      ...snapshot,
      period: `${snapshot.period.split(" a ")[0]} a ${new Date().toISOString().slice(0, 10)} (${days} días)`,
    };
  }

  async isReady(): Promise<boolean> {
    // Siempre disponible, pero nunca cuenta como conexión real con Garmin.
    return true;
  }

  async getActivities({ startDate, endDate }: { startDate: string; endDate: string }): Promise<GarminActivity[]> {
    const { activities } = buildDemoTrainingHistory();
    return activities.filter((activity) => {
      const day = activity.startedAt.slice(0, 10);
      return day >= startDate && day <= endDate;
    });
  }

  async getPerformanceSnapshot(): Promise<PerformanceSnapshot> {
    return buildDemoPerformanceSnapshotSolid();
  }

  async getHistoricalMetrics({
    startDate,
    endDate,
  }: {
    startDate: string;
    endDate: string;
  }): Promise<HistoricalMetricsDay[]> {
    return buildDemoHistoricalMetrics(startDate, endDate);
  }

  /**
   * Sólo tiene muestras sintéticas para la actividad demo
   * (`demo-act-cardio-w1-d1`) — cualquier otro id devuelve una serie vacía en
   * vez de inventar datos que no corresponden a esa actividad.
   */
  async getActivityDetails(activityId: string): Promise<ActivityTimeSeries> {
    const demo = buildDemoActivityTimeSeries();
    if (activityId !== demo.activityId) {
      return { activityId, source: "mock", samples: [], availableMetrics: [] };
    }
    return demo;
  }
}
