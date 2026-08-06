import { describe, expect, it } from "vitest";
import { fallbackGuidance } from "./performance-guidance-fallback";
import { assessPerformance } from "./performance-assessment";
import type { PerformanceSnapshot } from "../types/performance";

function snapshotWithReadiness(score: number): PerformanceSnapshot {
  return {
    id: "test",
    capturedAt: "2026-08-06T12:00:00.000Z",
    source: "mock",
    dataQuality: "complete",
    missingMetrics: [],
    trainingReadiness: { score },
  };
}

describe("fallbackGuidance", () => {
  it("entrega los 4 bloques requeridos para cada nivel", () => {
    for (const score of [90, 65, 45, 20]) {
      const assessment = assessPerformance(snapshotWithReadiness(score));
      const guidance = fallbackGuidance(assessment);
      expect(guidance.todayMessage).toBeTruthy();
      expect(guidance.nextWorkoutAdvice).toBeTruthy();
      expect(guidance.weeklyApproach).toBeTruthy();
      expect(guidance.motivationalLine).toBeTruthy();
    }
  });

  it("nunca es el mismo texto para 'push' y 'recover'", () => {
    const push = fallbackGuidance(assessPerformance(snapshotWithReadiness(90)));
    const recover = fallbackGuidance(assessPerformance(snapshotWithReadiness(20)));
    expect(push.todayMessage).not.toBe(recover.todayMessage);
  });
});
