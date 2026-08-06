import { describe, expect, it } from "vitest";
import { buildDemoSnapshot } from "../demo/garmin";
import { mapGarminSnapshotToPerformanceSnapshot } from "./performance-from-garmin-snapshot";

describe("mapGarminSnapshotToPerformanceSnapshot", () => {
  it("mapea las métricas presentes en el snapshot demo de Garmin", () => {
    const reference = new Date("2026-08-06T12:00:00.000Z");
    const performance = mapGarminSnapshotToPerformanceSnapshot(buildDemoSnapshot(reference), reference);

    expect(performance.source).toBe("garmin");
    expect(performance.capturedAt).toBe(reference.toISOString());
    expect(performance.trainingReadiness?.score).toBe(62);
    expect(performance.sleep?.durationMinutes).toBe(402);
    expect(performance.hrv?.status).toBe("unbalanced");
    expect(performance.bodyBattery?.current).toBe(61);
    expect(performance.recovery?.remainingHours).toBe(18);
    expect(performance.acuteLoad?.value).toBe(271);
  });

  it("no fabrica un rango óptimo de carga aguda que Garmin no entrega", () => {
    const performance = mapGarminSnapshotToPerformanceSnapshot(buildDemoSnapshot());
    expect(performance.acuteLoad?.optimalLow).toBeUndefined();
    expect(performance.acuteLoad?.optimalHigh).toBeUndefined();
    expect(performance.loadFocus).toBeUndefined();
  });

  it("declara dataQuality y missingMetrics coherentes con lo ausente", () => {
    const performance = mapGarminSnapshotToPerformanceSnapshot(buildDemoSnapshot());
    expect(performance.dataQuality).toBe("complete");
    expect(performance.missingMetrics).not.toContain("Training Readiness");
  });
});
