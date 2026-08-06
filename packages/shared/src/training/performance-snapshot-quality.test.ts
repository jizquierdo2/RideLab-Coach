import { describe, expect, it } from "vitest";
import { derivePerformanceDataQuality } from "./performance-snapshot-quality";

describe("derivePerformanceDataQuality", () => {
  it("complete cuando están las 4 métricas prioritarias", () => {
    const { dataQuality, missingMetrics } = derivePerformanceDataQuality({
      trainingReadiness: { score: 70 },
      sleep: { score: 80 },
      hrv: { status: "balanced" },
      bodyBattery: { current: 70 },
    });
    expect(dataQuality).toBe("complete");
    expect(missingMetrics.length).toBeGreaterThan(0); // secundarias siguen faltando, y se declaran
  });

  it("partial cuando falta una prioritaria pero hay Training Readiness", () => {
    const { dataQuality } = derivePerformanceDataQuality({
      trainingReadiness: { score: 70 },
    });
    expect(dataQuality).toBe("partial");
  });

  it("insufficient cuando no hay Training Readiness ni suficientes señales secundarias", () => {
    const { dataQuality, missingMetrics } = derivePerformanceDataQuality({});
    expect(dataQuality).toBe("insufficient");
    expect(missingMetrics).toContain("Training Readiness");
  });
});
