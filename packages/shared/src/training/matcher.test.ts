import { describe, expect, it } from "vitest";
import {
  buildDemoFreeRideActivity,
  buildDemoMatchingActivity,
  buildDemoSessionExecution,
  buildDemoUnlinkedActivity,
} from "../demo/training-history";
import { findMatches, scoreMatch, AUTO_CONFIRM_THRESHOLD, SUGGESTED_THRESHOLD } from "./matcher";
import type { GarminActivity, SessionExecution } from "../types/training-history";

const PLANNED_MINUTES = 60;

function execution(overrides: Partial<SessionExecution> = {}): SessionExecution & { plannedDurationMinutes: number } {
  return { ...buildDemoSessionExecution(), plannedDurationMinutes: PLANNED_MINUTES, ...overrides };
}

describe("scoreMatch", () => {
  it("detecta el match del 5 de agosto con alta confianza", () => {
    const score = scoreMatch(buildDemoSessionExecution(), buildDemoMatchingActivity(), PLANNED_MINUTES);
    expect(score).toBeGreaterThanOrEqual(AUTO_CONFIRM_THRESHOLD);
  });

  it("no vincula actividades de una fecha distinta", () => {
    const score = scoreMatch(buildDemoSessionExecution(), buildDemoFreeRideActivity(), PLANNED_MINUTES);
    expect(score).toBeLessThan(SUGGESTED_THRESHOLD);
  });
});

describe("findMatches", () => {
  it("clasifica el match del 5 de agosto como auto-confirm", () => {
    const [result] = findMatches([execution()], [buildDemoMatchingActivity()]);
    expect(result.status).toBe("auto-confirm");
    expect(result.best?.activityId).toBe(buildDemoMatchingActivity().id);
  });

  it("no vincula actividades de fechas distintas: la salida libre queda sin match", () => {
    const [result] = findMatches([execution()], [buildDemoFreeRideActivity(), buildDemoUnlinkedActivity()]);
    expect(result.status).toBe("none");
    expect(result.candidates).toHaveLength(0);
  });

  it("exige confirmación cuando dos candidatas quedan empatadas", () => {
    const base = buildDemoMatchingActivity();
    const rival: GarminActivity = { ...base, id: "demo-act-rival", startedAt: "2026-08-05T23:09:00.000Z" };

    const [result] = findMatches([execution()], [base, rival]);

    expect(result.status).toBe("suggested");
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it("no vuelve a sugerir un par ya rechazado por el usuario", () => {
    const activity = buildDemoMatchingActivity();
    const rejected = new Set([`${buildDemoSessionExecution().id}::${activity.id}`]);

    const [result] = findMatches([execution()], [activity], rejected);

    expect(result.status).toBe("none");
  });
});
