import { describe, expect, it } from "vitest";
import { buildDemoSnapshot, type ChatRequest } from "@ridelab/shared";
import { MockAgentGateway } from "./mock";

/**
 * Regresión: el coach afirmaba "Reportaste dolor relevante" cuando el usuario
 * respondía "ninguna molestia" a la pregunta del perfil. Nunca debe atribuirle
 * al usuario algo que no dijo.
 */

const gateway = new MockAgentGateway();
const snapshot = buildDemoSnapshot(new Date("2026-08-04T12:00:00.000Z"));

const PLAN_QUESTIONS =
  "Para armarte un plan seguro necesito sólo esto:\n\n1. ¿De cuánto tiempo dispones por sesión?";

function conversation(messages: ChatRequest["messages"], recentLogs: ChatRequest["recentLogs"] = []): ChatRequest {
  return { messages, recentLogs, trainingHistory: [] };
}

describe("negación de dolor", () => {
  it("no afirma que hubo dolor cuando el usuario responde 'ninguna molestia'", async () => {
    const message = await gateway.reply(
      conversation([
        { role: "user", content: "Créame un plan para MTB de dos días por semana" },
        { role: "assistant", content: PLAN_QUESTIONS },
        {
          role: "user",
          content:
            "Una hora por sesión, tengo mancuernas, kettlebell y barra de dominadas, experiencia intermedia, ninguna molestia",
        },
      ]),
      snapshot,
    );

    expect(message.content).not.toContain("Reportaste dolor");
    expect(message.planProposal).toBeDefined();
  });

  it("responde sin alarmar cuando se menciona el dolor sólo para negarlo", async () => {
    const message = await gateway.reply(
      conversation([{ role: "user", content: "No tengo dolor en ningún lado" }]),
      snapshot,
    );

    expect(message.content).not.toContain("Reportaste dolor");
    expect(message.content).toContain("sin molestias");
  });

  it("sí escala cuando el usuario afirma dolor", async () => {
    const message = await gateway.reply(
      conversation([{ role: "user", content: "Me duele la rodilla al bajar en la sentadilla" }]),
      snapshot,
    );

    expect(message.content).toContain("consulta a un profesional");
    expect(message.content).not.toMatch(/tienes (una )?(tendinitis|condromalacia|lesi[óo]n de)/i);
  });

  it("escala cuando un registro previo trae dolor alto", async () => {
    const message = await gateway.reply(
      conversation(
        [{ role: "user", content: "¿Debería preocuparme por esa molestia?" }],
        [{ sessionTitle: "Día 1", completedAt: new Date().toISOString(), painLevel: 8, exercises: [] }],
      ),
      snapshot,
    );

    expect(message.content).toContain("consulta a un profesional");
  });

  it("no escala cuando el registro previo trae dolor bajo", async () => {
    const message = await gateway.reply(
      conversation(
        [{ role: "user", content: "¿Y esa molestia leve?" }],
        [{ sessionTitle: "Día 1", completedAt: new Date().toISOString(), painLevel: 2, exercises: [] }],
      ),
      snapshot,
    );

    expect(message.content).not.toContain("consulta a un profesional");
  });
});

describe("continuidad del flujo de plan", () => {
  it("trata la respuesta a las preguntas como parte del flujo del plan", async () => {
    const message = await gateway.reply(
      conversation([
        { role: "user", content: "Quiero un plan de dos días por semana" },
        { role: "assistant", content: PLAN_QUESTIONS },
        {
          role: "user",
          content: "60 minutos, gimnasio completo, nivel intermedio, ninguna, quiero aguantar descensos",
        },
      ]),
      snapshot,
    );

    expect(message.planProposal).toBeDefined();
    expect(message.planProposal?.plan.weeks).toHaveLength(4);
  });

  it("adapta el plan a lo que el usuario declaró", async () => {
    const message = await gateway.reply(
      conversation([
        { role: "user", content: "Quiero un plan de dos días por semana" },
        { role: "assistant", content: PLAN_QUESTIONS },
        {
          role: "user",
          content: "90 minutos, mancuernas y kettlebell, avanzado, ninguna, quiero potencia en subidas",
        },
      ]),
      snapshot,
    );

    const plan = message.planProposal?.plan;
    expect(plan?.sessionDurationMinutes).toBe(90);
    expect(plan?.sourceContext.equipment).toEqual(expect.arrayContaining(["Mancuernas", "Kettlebell"]));
    expect(plan?.sourceContext.userGoals).toContain("Más potencia en subidas");
  });
});
