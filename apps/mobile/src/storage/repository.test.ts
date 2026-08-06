import { beforeEach, describe, expect, it } from "vitest";
import {
  buildDemoFreeRideActivity,
  buildDemoMatchingActivity,
  buildDemoPlan,
  type GarminActivity,
  type SessionLog,
  type TrainingPlan,
} from "@ridelab/shared";
import {
  activitySessionMatchRepository,
  clearAllData,
  garminActivityRepository,
  plannedSessionOccurrenceRepository,
  planRepository,
  profileRepository,
  sessionExecutionRepository,
  sessionLogRepository,
  sessionStatusRepository,
} from "./repository";

/**
 * Estos tests cubren el criterio de aceptación de persistencia: cerrar y volver
 * a abrir la app debe conservar plan y sesiones. La "reapertura" se simula
 * releyendo desde el almacenamiento, que es lo que hace el arranque real.
 */

const plan = (): TrainingPlan => buildDemoPlan(new Date("2026-08-04T12:00:00.000Z"));

beforeEach(async () => {
  await clearAllData();
});

describe("planRepository", () => {
  it("guarda un plan válido y lo recupera igual", async () => {
    const saved = await planRepository.save(plan());
    const loaded = await planRepository.get(saved.id);

    expect(loaded).toBeDefined();
    expect(loaded?.title).toBe("MTB Funcional — 2 días por semana");
    expect(loaded?.weeks).toHaveLength(4);
    expect(loaded?.weeks[0].sessions[0].sections.length).toBeGreaterThan(0);
  });

  it("no guarda un plan inválido", async () => {
    const invalid = { ...plan(), weeks: [] };
    await expect(planRepository.save(invalid)).rejects.toThrow(/Plan inválido/);
    expect(await planRepository.list()).toHaveLength(0);
  });

  it("no guarda un plan con una URL de video inventada", async () => {
    const broken = plan();
    broken.weeks[0].sessions[0].sections[0].exercises[0].videoUrl = "youtube: busca box jump";
    await expect(planRepository.save(broken)).rejects.toThrow();
    expect(await planRepository.list()).toHaveLength(0);
  });

  it("no guarda texto Markdown como si fuera un plan", async () => {
    await expect(planRepository.save("## Plan\n- Día 1")).rejects.toThrow();
    expect(await planRepository.list()).toHaveLength(0);
  });

  it("marca el plan guardado como activo y lo mantiene tras reabrir", async () => {
    const saved = await planRepository.save(plan());
    await planRepository.setActiveId(saved.id);

    // Simula reinicio de la app: se vuelve a leer todo desde el almacenamiento.
    const active = await planRepository.getActive();
    expect(active?.id).toBe(saved.id);
  });

  it("reemplaza el plan en vez de duplicarlo cuando se guarda dos veces", async () => {
    await planRepository.save(plan());
    await planRepository.save({ ...plan(), title: "Plan corregido" });

    const plans = await planRepository.list();
    expect(plans).toHaveLength(1);
    expect(plans[0].title).toBe("Plan corregido");
  });
});

describe("sessionStatusRepository", () => {
  it("recuerda el estado de cada sesión", async () => {
    await sessionStatusRepository.set("w1-d1", "completed");
    await sessionStatusRepository.set("w1-d2", "skipped");

    const all = await sessionStatusRepository.all();
    expect(all["w1-d1"]).toBe("completed");
    expect(all["w1-d2"]).toBe("skipped");
  });
});

describe("sessionLogRepository", () => {
  const log = (overrides: Partial<SessionLog> = {}): SessionLog => ({
    id: "log_1",
    planId: "demo-mtb-funcional",
    sessionId: "w1-d1",
    sessionTitle: "Potencia de Empuje e Impacto — Knee Dominant",
    weekNumber: 1,
    completedAt: new Date("2026-08-04T20:00:00.000Z").toISOString(),
    actualDurationMinutes: 58,
    sessionRpe: 7,
    exercises: [
      {
        exerciseId: "w1-d1-ex5",
        catalogExerciseId: "goblet-squat",
        name: "Sentadilla Goblet",
        completed: true,
        load: "24 kg",
        actualReps: "10",
      },
    ],
    ...overrides,
  });

  it("guarda el registro y lo recupera por sesión", async () => {
    await sessionLogRepository.save(log());
    const found = await sessionLogRepository.forSession("w1-d1");

    expect(found?.sessionRpe).toBe(7);
    expect(found?.exercises[0].load).toBe("24 kg");
  });

  it("conserva el registro tras reabrir la app", async () => {
    await sessionLogRepository.save(log());
    const reopened = await sessionLogRepository.list();
    expect(reopened).toHaveLength(1);
    expect(reopened[0].sessionTitle).toContain("Knee Dominant");
  });

  it("guarda el dolor reportado para que el agente pueda considerarlo", async () => {
    await sessionLogRepository.save(log({ id: "log_pain", pain: { level: 7, location: "rodilla" } }));
    const logs = await sessionLogRepository.list();
    const withPain = logs.find((entry) => entry.id === "log_pain");
    expect(withPain?.pain?.level).toBe(7);
    expect(withPain?.pain?.location).toBe("rodilla");
  });

  it("rechaza un RPE fuera de la escala", async () => {
    await expect(sessionLogRepository.save(log({ sessionRpe: 42 }))).rejects.toThrow(/Registro inválido/);
  });

  it("rechaza un nivel de dolor fuera de 0-10", async () => {
    await expect(
      sessionLogRepository.save(log({ pain: { level: 15 } })),
    ).rejects.toThrow(/Registro inválido/);
  });
});

describe("sessionExecutionRepository", () => {
  it("crea una ejecución al iniciar la sesión", async () => {
    const execution = await sessionExecutionRepository.start("w1-d1");

    expect(execution.plannedSessionId).toBe("w1-d1");
    expect(execution.status).toBe("started");
    expect(execution.finishedAt).toBeUndefined();

    const found = await sessionExecutionRepository.forPlannedSession("w1-d1");
    expect(found?.id).toBe(execution.id);
  });

  it("finaliza la ejecución iniciada, con RPE y dolor", async () => {
    await sessionExecutionRepository.start("w1-d1");
    const finished = await sessionExecutionRepository.finish("w1-d1", { actualRpe: 7, painLevel: 0 });

    expect(finished.status).toBe("completed");
    expect(finished.finishedAt).toBeDefined();
    expect(finished.actualRpe).toBe(7);
  });

  it("crea una ejecución sintética si se finaliza sin haber iniciado", async () => {
    const finished = await sessionExecutionRepository.finish("w1-d2", { actualRpe: 5 });

    expect(finished.status).toBe("completed");
    expect(finished.startedAt).toBe(finished.finishedAt);
  });

  it("conserva la ejecución tras reabrir la app", async () => {
    await sessionExecutionRepository.start("w1-d1");
    await sessionExecutionRepository.finish("w1-d1", { actualRpe: 8 });

    const reopened = await sessionExecutionRepository.list();
    expect(reopened).toHaveLength(1);
    expect(reopened[0].status).toBe("completed");
    expect(reopened[0].actualRpe).toBe(8);
  });
});

describe("repetir sesión", () => {
  it("repeatNow crea una ejecución nueva sin modificar la original", async () => {
    await sessionExecutionRepository.start("w1-d1");
    const original = await sessionExecutionRepository.finish("w1-d1", { actualRpe: 7 });

    const repeated = await sessionExecutionRepository.repeatNow("w1-d1", original.id);

    expect(repeated.id).not.toBe(original.id);
    expect(repeated.status).toBe("started");
    expect(repeated.sourceExecutionId).toBe(original.id);
    expect(repeated.occurrenceId).toBeDefined();

    // La original queda intacta: mismo RPE, mismo estado, misma fecha.
    const stillThere = (await sessionExecutionRepository.list()).find((e) => e.id === original.id);
    expect(stillThere?.actualRpe).toBe(7);
    expect(stillThere?.status).toBe("completed");
    expect(stillThere?.startedAt).toBe(original.startedAt);
  });

  it("repeatNow crea la occurrence con origin 'repeated'", async () => {
    const execution = await sessionExecutionRepository.start("w1-d1");
    const repeated = await sessionExecutionRepository.repeatNow("w1-d1", execution.id);

    const occurrence = (await plannedSessionOccurrenceRepository.list()).find((o) => o.id === repeated.occurrenceId);
    expect(occurrence?.origin).toBe("repeated");
    expect(occurrence?.templateId).toBe("w1-d1");
  });

  it("repeatSchedule programa una occurrence para otro día sin crear una ejecución", async () => {
    const execution = await sessionExecutionRepository.start("w1-d1");
    await sessionExecutionRepository.finish("w1-d1", { actualRpe: 6 });

    const occurrence = await sessionExecutionRepository.repeatSchedule("w1-d1", execution.id, "2026-09-01");

    expect(occurrence.status).toBe("planned");
    expect(occurrence.scheduledDate).toBe("2026-09-01");
    expect(occurrence.origin).toBe("repeated");

    const executions = await sessionExecutionRepository.list();
    expect(executions).toHaveLength(1); // sólo la original — programar no inicia nada
  });

  it("las occurrences sobreviven un reinicio", async () => {
    const execution = await sessionExecutionRepository.start("w1-d1");
    await sessionExecutionRepository.repeatSchedule("w1-d1", execution.id, "2026-09-01");

    const reopened = await plannedSessionOccurrenceRepository.forTemplate("w1-d1");
    expect(reopened).toHaveLength(1);
    expect(reopened[0].scheduledDate).toBe("2026-09-01");
  });
});

describe("garminActivityRepository", () => {
  it("importa una actividad y no la duplica si se vuelve a sincronizar", async () => {
    const activity = buildDemoMatchingActivity();
    await garminActivityRepository.save(activity);
    await garminActivityRepository.save(activity);

    const all = await garminActivityRepository.list();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(activity.id);
  });

  it("filtra actividades por rango de fecha", async () => {
    await garminActivityRepository.save(buildDemoMatchingActivity());
    await garminActivityRepository.save(buildDemoFreeRideActivity());

    const inRange = await garminActivityRepository.forDateRange("2026-08-05", "2026-08-05");
    expect(inRange).toHaveLength(1);
    expect(inRange[0].id).toBe(buildDemoMatchingActivity().id);
  });
});

describe("activitySessionMatchRepository", () => {
  const execution = () => sessionExecutionRepository.start("w1-d1");
  const activity = (overrides: Partial<GarminActivity> = {}): GarminActivity => ({
    ...buildDemoMatchingActivity(),
    ...overrides,
  });

  it("vincula manualmente una ejecución con una actividad", async () => {
    const exec = await execution();
    await garminActivityRepository.save(activity());

    const match = await activitySessionMatchRepository.confirm(exec.id, activity().id, {
      method: "manual",
      confidence: 1,
    });

    expect(match.status).toBe("confirmed");
    expect(match.method).toBe("manual");
    const forExec = await activitySessionMatchRepository.forExecution(exec.id);
    expect(forExec).toHaveLength(1);
  });

  it("desvincula un match confirmado", async () => {
    const exec = await execution();
    await activitySessionMatchRepository.confirm(exec.id, activity().id, { method: "manual", confidence: 1 });

    await activitySessionMatchRepository.unlink(exec.id, activity().id);

    expect(await activitySessionMatchRepository.forExecution(exec.id)).toHaveLength(0);
  });

  it("no permite confirmar la misma actividad en dos sesiones distintas", async () => {
    const exec1 = await sessionExecutionRepository.start("w1-d1");
    const exec2 = await sessionExecutionRepository.start("w1-d2");

    await activitySessionMatchRepository.confirm(exec1.id, activity().id, { method: "manual", confidence: 1 });

    await expect(
      activitySessionMatchRepository.confirm(exec2.id, activity().id, { method: "manual", confidence: 1 }),
    ).rejects.toThrow(/ya está vinculada/);
  });

  it("no permite confirmar dos actividades en la misma sesión", async () => {
    const exec = await execution();
    const activityB = activity({ id: "demo-act-rival" });

    await activitySessionMatchRepository.confirm(exec.id, activity().id, { method: "manual", confidence: 1 });

    await expect(
      activitySessionMatchRepository.confirm(exec.id, activityB.id, { method: "manual", confidence: 1 }),
    ).rejects.toThrow(/ya tiene una actividad/);
  });

  it("un rechazo queda disponible para que el matcher no vuelva a sugerirlo", async () => {
    const exec = await execution();
    await activitySessionMatchRepository.reject(exec.id, activity().id);

    const rejected = await activitySessionMatchRepository.rejectedPairKeys();
    expect(rejected.has(`${exec.id}::${activity().id}`)).toBe(true);
  });
});

describe("profileRepository", () => {
  it("acumula lo que el usuario ya respondió", async () => {
    await profileRepository.merge({ goals: ["Resistir descensos"] });
    await profileRepository.merge({ daysPerWeek: 2 });

    const profile = await profileRepository.get();
    expect(profile?.goals).toEqual(["Resistir descensos"]);
    expect(profile?.daysPerWeek).toBe(2);
  });
});
