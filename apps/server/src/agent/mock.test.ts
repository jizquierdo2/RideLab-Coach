import { describe, expect, it } from "vitest";
import { buildDemoSnapshot, validateTrainingPlan, type ChatRequest, type GarminSnapshot } from "@ridelab/shared";
import { MockAgentGateway } from "./mock";

const gateway = new MockAgentGateway();
const snapshot = buildDemoSnapshot(new Date("2026-08-04T12:00:00.000Z"));

function ask(content: string, extra: Partial<ChatRequest> = {}): ChatRequest {
  return { messages: [{ role: "user", content }], recentLogs: [], trainingHistory: [], ...extra };
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
};

describe("respuestas sobre métricas", () => {
  it("responde recuperación declarando periodo, sincronización y fuente", async () => {
    const message = await gateway.reply(ask("¿Cómo está mi recuperación hoy?"), snapshot);
    expect(message.analysis?.period).toBe(snapshot.period);
    expect(message.analysis?.lastSyncAt).toBe(snapshot.lastSyncAt);
    expect(message.analysis?.dataSource).toBe("mock");
    expect(message.isDemoData).toBe(true);
  });

  it("entrega chips de métricas en vez de un muro de texto", async () => {
    const message = await gateway.reply(ask("¿Cómo está mi recuperación hoy?"), snapshot);
    const labels = message.analysis?.metrics.map((m) => m.label) ?? [];
    expect(labels).toContain("Sueño");
    expect(labels).toContain("HRV");
    expect(labels).toContain("Body Battery");
    expect(message.content).toBe("");
  });

  it("separa interpretación de recomendación", async () => {
    const message = await gateway.reply(ask("¿Estoy listo para entrenar fuerte?"), snapshot);
    expect(message.analysis?.interpretation).toBeTruthy();
    expect(message.analysis?.recommendation).toBeTruthy();
  });

  it("analiza la última salida usando sólo datos presentes", async () => {
    const message = await gateway.reply(ask("Analiza mi última salida en bicicleta"), snapshot);
    expect(message.analysis?.headline).toContain("Las Condes");
  });

  it("compara contra las últimas semanas", async () => {
    const message = await gateway.reply(ask("Compárame con las últimas cuatro semanas"), snapshot);
    expect(message.analysis?.metrics.some((m) => m.label === "Volumen")).toBe(true);
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

  it("dice explícitamente que no puede dar un veredicto", async () => {
    const message = await gateway.reply(ask("¿Cómo está mi recuperación hoy?"), empty);
    expect(message.analysis?.headline).toContain("No tengo");
    expect(message.analysis?.metrics).toHaveLength(0);
  });

  it("nunca inventa métricas ausentes", async () => {
    const message = await gateway.reply(ask("¿Cómo está mi recuperación hoy?"), empty);
    expect(message.analysis?.unavailableMetrics).toEqual(
      expect.arrayContaining(["Sueño", "HRV", "Training Readiness"]),
    );
  });

  it("avisa cuando no hay salidas en bicicleta", async () => {
    const message = await gateway.reply(ask("Analiza mi última salida en bicicleta"), empty);
    expect(message.analysis?.headline).toContain("No encuentro");
  });

  it("no habla de progresión sin sesiones registradas", async () => {
    const message = await gateway.reply(ask("¿Estoy progresando?"), empty);
    expect(message.analysis?.headline).toContain("no tienes sesiones registradas".slice(0, 20));
  });
});

describe("creación de plan", () => {
  it("pregunta lo mínimo cuando falta información del atleta", async () => {
    const message = await gateway.reply(ask("Créame un plan de entrenamiento"), snapshot);
    expect(message.planProposal).toBeUndefined();
    expect(message.content).toContain("objetivo");
  });

  it("no vuelve a preguntar lo que ya está en el perfil", async () => {
    const message = await gateway.reply(
      ask("Créame un plan funcional para MTB de dos días por semana", { athleteProfile: fullProfile }),
      snapshot,
    );
    expect(message.content).toBe("");
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

    expect(message.analysis?.headline).toContain("1 de 2");
    expect(message.analysis?.metrics.some((m) => m.label === "Actividades libres" && m.value === "1")).toBe(true);
  });

  it("avisa cuando todavía no hay historial ejecutado, sin inventar cumplimiento", async () => {
    const message = await gateway.reply(ask("¿Cuántas sesiones completé este mes?"), snapshot);
    expect(message.analysis?.unavailableMetrics).toContain("Historial combinado");
  });
});
