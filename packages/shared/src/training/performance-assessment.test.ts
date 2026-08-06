import { describe, expect, it } from "vitest";
import { assessPerformance } from "./performance-assessment";
import { buildDemoPerformanceSnapshotRecover, buildDemoPerformanceSnapshotSolid } from "../demo/performance";
import type { PerformanceSnapshot } from "../types/performance";

function baseSnapshot(overrides: Partial<PerformanceSnapshot> = {}): PerformanceSnapshot {
  return {
    id: "test",
    capturedAt: "2026-08-06T12:00:00.000Z",
    source: "mock",
    dataQuality: "complete",
    missingMetrics: [],
    ...overrides,
  };
}

describe("assessPerformance — un caso por nivel", () => {
  it("push cuando Training Readiness >= 80", () => {
    const result = assessPerformance(baseSnapshot({ trainingReadiness: { score: 85 } }));
    expect(result.level).toBe("push");
    expect(result.label).toBe("Con fuerza");
    expect(result.suggestedTrainingMode).toBe("increase_slightly");
    expect(result.suggestedLoadAdjustmentPercent).toEqual({ min: 5, max: 10 });
  });

  it("solid cuando Training Readiness está entre 60 y 79", () => {
    const result = assessPerformance(baseSnapshot({ trainingReadiness: { score: 68 } }));
    expect(result.level).toBe("solid");
    expect(result.label).toBe("Sólido");
    expect(result.suggestedTrainingMode).toBe("follow_plan");
    expect(result.suggestedLoadAdjustmentPercent).toBeUndefined();
  });

  it("controlled cuando Training Readiness está entre 40 y 59", () => {
    const result = assessPerformance(baseSnapshot({ trainingReadiness: { score: 45 } }));
    expect(result.level).toBe("controlled");
    expect(result.label).toBe("Carga controlada");
    expect(result.suggestedTrainingMode).toBe("reduce_load");
    expect(result.suggestedLoadAdjustmentPercent).toEqual({ min: -20, max: -10 });
  });

  it("recover cuando Training Readiness < 40", () => {
    const result = assessPerformance(baseSnapshot({ trainingReadiness: { score: 36 } }));
    expect(result.level).toBe("recover");
    expect(result.label).toBe("Recuperar");
    expect(result.suggestedTrainingMode).toBe("recovery_only");
  });

  it("insufficient cuando el snapshot ya llega con dataQuality insuficiente", () => {
    const result = assessPerformance(baseSnapshot({ dataQuality: "insufficient" }));
    expect(result.level).toBe("insufficient");
    expect(result.label).toBe("Faltan datos");
    expect(result.suggestedTrainingMode).toBe("unknown");
  });
});

describe("assessPerformance — no inventa Training Readiness", () => {
  it("sin Training Readiness pero con suficientes señales secundarias, usa un compuesto", () => {
    const result = assessPerformance(
      baseSnapshot({
        sleep: { score: 85 },
        hrv: { status: "balanced" },
        bodyBattery: { current: 80 },
      }),
    );
    // No hay trainingReadiness en el snapshot de entrada: el nivel viene del compuesto, no de un valor inventado.
    expect(result.level).not.toBe("insufficient");
    expect(["push", "solid"]).toContain(result.level);
  });

  it("sin Training Readiness y sin señales secundarias suficientes, declara 'insufficient' en vez de adivinar", () => {
    const result = assessPerformance(baseSnapshot({ sleep: { score: 70 } }));
    expect(result.level).toBe("insufficient");
    expect(result.label).toBe("Faltan datos");
  });
});

describe("assessPerformance — drivers reales, no genéricos", () => {
  it("el estado Sólido demo produce factores a favor coherentes con sus propios datos", () => {
    const result = assessPerformance(buildDemoPerformanceSnapshotSolid(new Date("2026-08-06T12:00:00.000Z")));
    expect(result.level).toBe("solid");
    expect(result.positiveDrivers.some((d) => d.includes("Sueño reparador"))).toBe(true);
    expect(result.positiveDrivers.some((d) => d.includes("HRV equilibrado"))).toBe(true);
    expect(result.cautionDrivers.some((d) => d.includes("recuperación pendientes"))).toBe(true);
  });

  it("el estado Recuperar demo produce factores a cuidar coherentes con sus propios datos", () => {
    const result = assessPerformance(buildDemoPerformanceSnapshotRecover(new Date("2026-08-06T12:00:00.000Z")));
    expect(result.level).toBe("recover");
    expect(result.cautionDrivers.some((d) => d.includes("HRV"))).toBe(true);
    expect(result.cautionDrivers.some((d) => d.includes("Estrés elevado"))).toBe(true);
  });
});
