import { describe, expect, it } from "vitest";
import {
  buildDemoFreeRideActivity,
  buildDemoMatchingActivity,
  buildDemoPlan,
  buildDemoSessionExecution,
  DEMO_PLAN_ID,
  type ActivitySessionMatch,
} from "@ridelab/shared";
import { buildChatTrainingHistoryEntries, buildCombinedRecords, findPlannedSession, repeatedFromLabel } from "./calendar";

const plan = buildDemoPlan(new Date("2026-08-04T12:00:00.000Z"));
const execution = buildDemoSessionExecution();
const activity = buildDemoMatchingActivity();
const freeRide = buildDemoFreeRideActivity();

const confirmedMatch: ActivitySessionMatch = {
  id: "match_1",
  sessionExecutionId: execution.id,
  garminActivityId: activity.id,
  status: "confirmed",
  method: "automatic",
  confidence: 1,
  createdAt: execution.startedAt,
  confirmedAt: execution.startedAt,
};

describe("findPlannedSession", () => {
  it("encuentra la sesión planificada por id en cualquier plan guardado", () => {
    const found = findPlannedSession([plan], "w1-d1");
    expect(found?.planId).toBe(DEMO_PLAN_ID);
    expect(found?.exerciseCount).toBe(10);
  });
});

describe("buildCombinedRecords", () => {
  it("une ejecución, plan y actividad Garmin cuando hay match confirmado", () => {
    const [record] = buildCombinedRecords([plan], [execution], [activity], [confirmedMatch]);
    expect(record.plannedSession.id).toBe("w1-d1");
    expect(record.garminActivity?.id).toBe(activity.id);
    expect(record.match?.status).toBe("confirmed");
  });
});

describe("buildChatTrainingHistoryEntries", () => {
  it("entrega la sesión vinculada y la actividad libre por separado", () => {
    const entries = buildChatTrainingHistoryEntries([plan], [execution], [activity, freeRide], [confirmedMatch]);

    const session = entries.find((entry) => entry.kind === "session");
    expect(session?.plannedSessionId).toBe("w1-d1");
    expect(session?.actualRpe).toBe(7);
    expect(session?.garminActivityName).toBe("Cardio");
    expect(session?.matchStatus).toBe("confirmed");

    const free = entries.find((entry) => entry.kind === "freeActivity");
    expect(free?.plannedSessionId).toBeUndefined();
    expect(free?.garminActivityName).toBe(freeRide.name);
  });

  it("marca origin 'plan' para una ejecución sin sourceExecutionId y 'repeated' cuando lo tiene", () => {
    const [planEntry] = buildChatTrainingHistoryEntries([plan], [execution], [], []);
    expect(planEntry.origin).toBe("plan");
    expect(planEntry.sourceExecutionId).toBeUndefined();

    const repeated = { ...execution, id: "exec_repeat", sourceExecutionId: execution.id };
    const [, repeatedEntry] = buildChatTrainingHistoryEntries([plan], [execution, repeated], [], []);
    expect(repeatedEntry.origin).toBe("repeated");
    expect(repeatedEntry.sourceExecutionId).toBe(execution.id);
  });
});

describe("repeatedFromLabel", () => {
  it("no dice nada para una ejecución que no es una repetición", () => {
    expect(repeatedFromLabel(execution, [execution])).toBeUndefined();
  });

  it("arma el texto 'Repetida desde…' cuando encuentra la ejecución original", () => {
    const repeated = { ...execution, id: "exec_repeat", sourceExecutionId: execution.id };
    expect(repeatedFromLabel(repeated, [execution, repeated])).toBe(
      `Repetida desde la sesión del ${new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        day: "numeric",
        month: "long",
      }).format(new Date(execution.startedAt))}`,
    );
  });

  it("no dice nada si la ejecución original ya no está disponible", () => {
    const repeated = { ...execution, id: "exec_repeat", sourceExecutionId: "exec_desaparecida" };
    expect(repeatedFromLabel(repeated, [repeated])).toBeUndefined();
  });
});
