import { describe, expect, it } from "vitest";
import type { ExerciseExecution } from "../types/exercise-execution";
import {
  completeExercise,
  findActiveExecution,
  nextPendingExercise,
  revertCompletion,
  skipExercise,
  startExercise,
} from "./exercise-execution";

function pendingExecution(overrides: Partial<ExerciseExecution> = {}): ExerciseExecution {
  return {
    id: "ex1",
    sessionExecutionId: "sess1",
    trainingExerciseId: "w1-d1-ex1",
    catalogExerciseId: "hip-90-90",
    order: 0,
    status: "pending",
    createdAt: "2026-08-05T23:00:00.000Z",
    updatedAt: "2026-08-05T23:00:00.000Z",
    ...overrides,
  };
}

describe("startExercise", () => {
  it("registra startedAt exactamente con el occurredAt recibido, no con otra hora", () => {
    const { execution, event } = startExercise(pendingExecution(), {
      occurredAt: "2026-08-05T23:12:00.000Z",
      eventId: "evt1",
    });
    expect(execution.status).toBe("active");
    expect(execution.startedAt).toBe("2026-08-05T23:12:00.000Z");
    expect(event.type).toBe("started");
    expect(event.occurredAt).toBe("2026-08-05T23:12:00.000Z");
  });

  it("rechaza iniciar un ejercicio que no está pendiente", () => {
    const active = pendingExecution({ status: "active", startedAt: "2026-08-05T23:12:00.000Z" });
    expect(() => startExercise(active, { occurredAt: "2026-08-05T23:13:00.000Z", eventId: "evt2" })).toThrow();
  });
});

describe("completeExercise", () => {
  it("calcula la duración real como completedAt - startedAt, no por orden", () => {
    const active = pendingExecution({ status: "active", startedAt: "2026-08-05T23:12:00.000Z" });
    const { execution } = completeExercise(active, { occurredAt: "2026-08-05T23:16:00.000Z", eventId: "evt3" });
    expect(execution.status).toBe("completed");
    expect(execution.completedAt).toBe("2026-08-05T23:16:00.000Z");
    expect(execution.durationSeconds).toBe(240);
  });

  it("guarda el RPE opcional", () => {
    const active = pendingExecution({ status: "active", startedAt: "2026-08-05T23:18:00.000Z" });
    const { execution } = completeExercise(active, {
      occurredAt: "2026-08-05T23:24:00.000Z",
      eventId: "evt4",
      rpe: 8,
    });
    expect(execution.rpe).toBe(8);
  });

  it("rechaza completar un ejercicio que no está activo", () => {
    expect(() =>
      completeExercise(pendingExecution(), { occurredAt: "2026-08-05T23:16:00.000Z", eventId: "evt5" }),
    ).toThrow();
  });
});

describe("revertCompletion", () => {
  it("vuelve a active y limpia completedAt/duración/RPE, sin borrar el evento original", () => {
    const completed = pendingExecution({
      status: "completed",
      startedAt: "2026-08-05T23:12:00.000Z",
      completedAt: "2026-08-05T23:16:00.000Z",
      durationSeconds: 240,
      rpe: 7,
    });
    const { execution, event } = revertCompletion(completed, {
      occurredAt: "2026-08-05T23:17:00.000Z",
      eventId: "evt6",
    });
    expect(execution.status).toBe("active");
    expect(execution.completedAt).toBeUndefined();
    expect(execution.durationSeconds).toBeUndefined();
    expect(execution.rpe).toBeUndefined();
    expect(execution.startedAt).toBe("2026-08-05T23:12:00.000Z");
    expect(event.type).toBe("completion_reverted");
  });
});

describe("skipExercise", () => {
  it("permite omitir un ejercicio pendiente o activo", () => {
    const { execution } = skipExercise(pendingExecution(), {
      occurredAt: "2026-08-05T23:20:00.000Z",
      eventId: "evt7",
    });
    expect(execution.status).toBe("skipped");
    expect(execution.skippedAt).toBe("2026-08-05T23:20:00.000Z");
  });

  it("rechaza omitir un ejercicio ya completado", () => {
    const completed = pendingExecution({ status: "completed" });
    expect(() => skipExercise(completed, { occurredAt: "2026-08-05T23:20:00.000Z", eventId: "evt8" })).toThrow();
  });
});

describe("findActiveExecution", () => {
  it("encuentra el único ejercicio activo entre varios", () => {
    const executions = [
      pendingExecution({ id: "ex1", order: 0, status: "completed" }),
      pendingExecution({ id: "ex2", order: 1, status: "active" }),
      pendingExecution({ id: "ex3", order: 2, status: "pending" }),
    ];
    expect(findActiveExecution(executions)?.id).toBe("ex2");
  });

  it("devuelve undefined si no hay ninguno activo", () => {
    const executions = [pendingExecution({ id: "ex1", status: "completed" })];
    expect(findActiveExecution(executions)).toBeUndefined();
  });
});

describe("nextPendingExercise", () => {
  it("devuelve el primer pendiente por orden, no por posición en el array", () => {
    const executions = [
      pendingExecution({ id: "ex3", order: 2, status: "pending" }),
      pendingExecution({ id: "ex1", order: 0, status: "completed" }),
      pendingExecution({ id: "ex2", order: 1, status: "pending" }),
    ];
    expect(nextPendingExercise(executions)?.id).toBe("ex2");
  });
});
