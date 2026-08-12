import { describe, expect, it } from "vitest";
import {
  assessPerformance,
  buildDemoPerformanceSnapshotSolid,
  buildDemoSnapshot,
  validateTrainingPlan,
  type ChatRequest,
  type GarminSnapshot,
} from "@ridelab/shared";
import { MockAgentGateway } from "./mock";

const gateway = new MockAgentGateway();
const snapshot = buildDemoSnapshot(new Date("2026-08-04T12:00:00.000Z"));

function ask(content: string, extra: Partial<ChatRequest> = {}): ChatRequest {
  return { messages: [{ role: "user", content }], recentLogs: [], trainingHistory: [], subjectiveNotes: [], ...extra };
}

/** Perfil completo: con esto el coach ya no debe preguntar nada más. */
const fullProfile = {
  goals: ["Resistir descensos largos"],
  daysPerWeek: 2,
  sessionDurationMinutes: 60,
  equipment: ["Mancuernas", "Kettlebell"],
  experienceLevel: "intermediate" as const,
  limitations: [],
  weeklySports: ["MTB"],
  ridingDisciplines: [],
};

describe("respuestas sobre métricas", () => {
  it("responde recuperación como texto conversacional, con la fuente de datos usada", async () => {
    const message = await gateway.reply(ask("¿Cómo está mi recuperación hoy?"), snapshot);
    expect(message.content.length).toBeGreaterThan(0);
    expect(message.dataSources?.some((source) => source.type === "garmin")).toBe(true);
    expect(message.isDemoData).toBe(true);
  });

  it("no fragmenta la respuesta en secciones tituladas", async () => {
    const message = await gateway.reply(ask("¿Cómo está mi recuperación hoy?"), snapshot);
    expect(message.content).not.toMatch(/dato observado|interpretaci[óo]n|recomendaci[óo]n:/i);
  });

  it("ofrece revisar el estado como acción sugerida cuando hay readiness", async () => {
    const message = await gateway.reply(ask("¿Estoy listo para entrenar fuerte?"), snapshot);
    expect(message.suggestedActions?.some((action) => action.action === "open_status")).toBe(true);
    expect(message.suggestedActions?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it("analiza la última salida usando sólo datos presentes", async () => {
    const message = await gateway.reply(ask("Analiza mi última salida en bicicleta"), snapshot);
    expect(message.content).toContain("Las Condes");
  });

  it("compara contra las últimas semanas citando la fuente de la comparación", async () => {
    const message = await gateway.reply(ask("Compárame con las últimas cuatro semanas"), snapshot);
    expect(message.dataSources?.some((source) => source.label === "Comparación de 4 semanas")).toBe(true);
  });
});

describe("cuando faltan datos de Garmin", () => {
  const empty: GarminSnapshot = {
    dataSource: "mock",
    period: "sin datos",
    lastSyncAt: new Date().toISOString(),
    connected: false,
    recentActivities: [],
    weeklyTrends: [],
    unavailableMetrics: ["Sueño", "HRV", "Training Readiness"],
  };

  it("dice explícitamente que no puede dar un veredicto, sin inventar una fuente de datos", async () => {
    const message = await gateway.reply(ask("¿Cómo está mi recuperación hoy?"), empty);
    expect(message.content).toContain("No tengo");
    expect(message.dataSources).toHaveLength(0);
  });

  it("avisa cuando no hay salidas en bicicleta", async () => {
    const message = await gateway.reply(ask("Analiza mi última salida en bicicleta"), empty);
    expect(message.content).toContain("No encuentro");
  });

  it("no habla de progresión sin sesiones registradas", async () => {
    const message = await gateway.reply(ask("¿Estoy progresando?"), empty);
    expect(message.content).toContain("no puedo hablar de progresión");
  });
});

describe("creación de plan", () => {
  it("pregunta lo mínimo cuando falta información del atleta", async () => {
    const message = await gateway.reply(ask("Créame un plan de entrenamiento"), snapshot);
    expect(message.planProposal).toBeUndefined();
    expect(message.content).toContain("objetivo");
  });

  it("no vuelve a preguntar lo que ya está en el perfil, y presenta el plan con un mensaje natural", async () => {
    const message = await gateway.reply(
      ask("Créame un plan funcional para MTB de dos días por semana", { athleteProfile: fullProfile }),
      snapshot,
    );
    expect(message.content.length).toBeGreaterThan(0);
    expect(message.content).not.toMatch(/dato observado|interpretaci[óo]n/i);
    expect(message.planProposal).toBeDefined();
  });

  it("entrega el plan como datos estructurados válidos, no como Markdown", async () => {
    const message = await gateway.reply(
      ask("Créame un plan", { athleteProfile: fullProfile }),
      snapshot,
    );
    const plan = message.planProposal?.plan;
    expect(plan).toBeDefined();
    expect(validateTrainingPlan(plan).ok).toBe(true);
    expect(message.planProposal?.summary).toContain("semanas");
  });
});

describe("dolor y seguridad", () => {
  it("no diagnostica y deriva a un profesional ante dolor relevante", async () => {
    const message = await gateway.reply(
      ask("He sentido dolor en la rodilla, ¿qué ejercicio debería reemplazar?", {
        recentLogs: [
          {
            sessionTitle: "Día 1",
            completedAt: new Date().toISOString(),
            painLevel: 7,
            exercises: [],
          },
        ],
      }),
      snapshot,
    );
    expect(message.content).toContain("consulta a un profesional");
    expect(message.content).not.toMatch(/tienes (una )?(tendinitis|lesión de)/i);
  });
});

describe("generateGuidance (Estado)", () => {
  it("entrega los 4 bloques sin depender del LLM", async () => {
    const assessment = assessPerformance(buildDemoPerformanceSnapshotSolid());
    const guidance = await gateway.generateGuidance(assessment);
    expect(guidance.todayMessage).toBeTruthy();
    expect(guidance.nextWorkoutAdvice).toBeTruthy();
    expect(guidance.weeklyApproach).toBeTruthy();
    expect(guidance.motivationalLine).toBeTruthy();
  });
});

describe("historial combinado (Calendario)", () => {
  it("resume cumplimiento a partir de trainingHistory, sin inventar sesiones", async () => {
    const message = await gateway.reply(
      ask("¿Cumplí mi plan esta semana?", {
        trainingHistory: [
          {
            kind: "session",
            date: "2026-08-05",
            plannedSessionId: "w1-d1",
            plannedTitle: "Día 1",
            executionStatus: "completed",
            matchStatus: "confirmed",
          },
          { kind: "session", date: "2026-08-06", plannedSessionId: "w1-d2", executionStatus: "started" },
          { kind: "freeActivity", date: "2026-08-04", garminActivityName: "Salida libre" },
        ],
      }),
      snapshot,
    );

    expect(message.content).toContain("1 de 2");
    expect(message.dataSources?.some((source) => source.type === "training_history")).toBe(true);
  });

  it("avisa cuando todavía no hay historial ejecutado, sin inventar cumplimiento", async () => {
    const message = await gateway.reply(ask("¿Cuántas sesiones completé este mes?"), snapshot);
    expect(message.content).toContain("Todavía no tengo sesiones ejecutadas");
    expect(message.dataSources).toHaveLength(0);
  });
});
