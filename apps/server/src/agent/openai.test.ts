import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import { assessPerformance, buildDemoPerformanceSnapshotRecover, buildDemoSnapshot, type ChatRequest } from "@ridelab/shared";
import { OpenAIAgentGateway } from "./openai";

const snapshot = buildDemoSnapshot(new Date("2026-08-05T12:00:00.000Z"));

function request(trainingHistory: ChatRequest["trainingHistory"] = [], content = "¿Cumplí mi plan esta semana?"): ChatRequest {
  return { messages: [{ role: "user", content }], recentLogs: [], trainingHistory, subjectiveNotes: [] };
}

/** Cliente falso: nunca pega a la red real, el test controla cada respuesta. */
function fakeClient(create: ReturnType<typeof vi.fn>): OpenAI {
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

const HISTORY: ChatRequest["trainingHistory"] = [
  {
    kind: "session",
    date: "2026-08-05",
    plannedSessionId: "w1-d1",
    plannedTitle: "Potencia de Empuje e Impacto",
    executionStatus: "completed",
    actualRpe: 7,
    garminActivityName: "Cardio",
    matchStatus: "confirmed",
  },
];

describe("OpenAIAgentGateway — loop de tool-calling", () => {
  it("no inyecta el historial en el prompt del primer turno", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "Sin datos.", tool_calls: [] } }],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    await gateway.reply(request(HISTORY), snapshot);

    const firstCallMessages = create.mock.calls[0][0].messages;
    const serialized = JSON.stringify(firstCallMessages);
    expect(serialized).not.toContain("Potencia de Empuje e Impacto");
    expect(serialized).not.toContain("plannedTitle");
  });

  it("hace una segunda vuelta cuando el modelo pide get_training_history, y usa el resultado en la respuesta final", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "get_training_history",
                    arguments: JSON.stringify({ startDate: "2026-08-01", endDate: "2026-08-05" }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          { message: { role: "assistant", content: "Completaste 1 de 1 sesiones esta semana.", tool_calls: [] } },
        ],
      });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    const message = await gateway.reply(request(HISTORY), snapshot);

    expect(create).toHaveBeenCalledTimes(2);

    const secondCallMessages = create.mock.calls[1][0].messages as Array<{ role: string; content: string }>;
    const toolMessage = secondCallMessages.find((m) => m.role === "tool");
    expect(toolMessage).toBeDefined();

    const toolResult = JSON.parse(toolMessage!.content);
    expect(toolResult).toHaveLength(1);
    expect(toolResult[0].plannedTitle).toBe("Potencia de Empuje e Impacto");

    expect(message.content).toBe("Completaste 1 de 1 sesiones esta semana.");
  });

  it("resuelve get_training_record filtrando por sessionId", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "get_training_record", arguments: JSON.stringify({ sessionId: "w1-d1" }) },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: "RPE 7, sesión completada.", tool_calls: [] } }],
      });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    await gateway.reply(request(HISTORY, "¿Qué tan intensa fue mi sesión del día 1?"), snapshot);

    const secondCallMessages = create.mock.calls[1][0].messages as Array<{ role: string; content: string }>;
    const toolMessage = secondCallMessages.find((m) => m.role === "tool");
    const toolResult = JSON.parse(toolMessage!.content);
    expect(toolResult.actualRpe).toBe(7);
  });

  it("resuelve get_historical_metrics contra el proveedor inyectado cuando el modelo pregunta por un día que no es hoy", async () => {
    const historicalMetrics = vi.fn().mockResolvedValue([
      { date: "2026-08-03", sleepScore: 81, sleepDurationMinutes: 432, trainingReadinessScore: 70 },
    ]);
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "get_historical_metrics",
                    arguments: JSON.stringify({ startDate: "2026-08-03", endDate: "2026-08-03" }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: "Dormiste 7h12m, puntaje 81.", tool_calls: [] } }],
      });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create), historicalMetrics);
    const message = await gateway.reply(request([], "¿Cómo dormí antes de ayer?"), snapshot);

    expect(historicalMetrics).toHaveBeenCalledWith({ startDate: "2026-08-03", endDate: "2026-08-03" });
    const secondCallMessages = create.mock.calls[1][0].messages as Array<{ role: string; content: string }>;
    const toolMessage = secondCallMessages.find((m) => m.role === "tool");
    expect(JSON.parse(toolMessage!.content)[0].sleepScore).toBe(81);
    expect(message.content).toBe("Dormiste 7h12m, puntaje 81.");
  });

  it("no ofrece get_historical_metrics cuando no se inyecta un resolver (modo mock/endpoint remoto)", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "Sin datos.", tool_calls: [] } }],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    await gateway.reply(request(), snapshot);

    const offeredTools = create.mock.calls[0][0].tools as Array<{ function: { name: string } }>;
    expect(offeredTools.map((t) => t.function.name)).not.toContain("get_historical_metrics");
  });

  it("fuerza una segunda vuelta con propose_training_plan cuando el pedido es un plan pero el modelo sólo dio report_metrics", async () => {
    const minimalPlan = {
      id: "plan_1",
      title: "Plan MTB Funcional",
      goal: "Mejorar en MTB",
      sport: "mtb",
      durationWeeks: 1,
      daysPerWeek: 2,
      sessionDurationMinutes: 60,
      startDate: "2026-08-10",
      generatedAt: "2026-08-07T00:00:00.000Z",
      sourceContext: { userGoals: [], limitations: [], equipment: [] },
      weeks: [
        {
          number: 1,
          objective: "Adaptación",
          sessions: [
            {
              id: "w1-d1",
              dayLabel: "Día 1",
              title: "Potencia de empuje",
              focus: "Knee dominant",
              estimatedMinutes: 60,
              sections: [
                {
                  id: "sec1",
                  title: "Potencia",
                  order: 0,
                  exercises: [
                    {
                      id: "ex1",
                      catalogExerciseId: "box-jump",
                      name: "Box Jump",
                      why: "Absorción de impacto",
                      techniqueCues: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const create = vi
      .fn()
      .mockResolvedValueOnce({
        // Primera vuelta libre: el modelo elige sólo advertir sobre recuperación.
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "report_metrics",
                    arguments: JSON.stringify({
                      headline: "Baja disposición hoy",
                      metrics: [],
                      interpretation: "Recovery time alto",
                      recommendation: "Empieza con cargas moderadas",
                      unavailableMetrics: [],
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        // Segunda vuelta forzada: propose_training_plan con tool_choice.
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_2",
                  type: "function",
                  function: {
                    name: "propose_training_plan",
                    arguments: JSON.stringify({ plan: minimalPlan, summary: "4 semanas · 2 días por semana" }),
                  },
                },
              ],
            },
          },
        ],
      });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    const message = await gateway.reply(request([], "Hazme este plan de entrenamiento con estos ejercicios"), snapshot);

    expect(create).toHaveBeenCalledTimes(2);
    // La segunda llamada fuerza la tool: no queda a elección libre del modelo.
    expect(create.mock.calls[1][0].tool_choice).toEqual({
      type: "function",
      function: { name: "propose_training_plan" },
    });
    expect(message.planProposal?.plan.title).toBe("Plan MTB Funcional");
    // El análisis de la primera vuelta no se pierde.
    expect(message.analysis?.headline).toBe("Baja disposición hoy");
    expect(message.error).toBeUndefined();
  });

  it("no fuerza una segunda vuelta si el mensaje no pedía un plan", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "report_metrics",
                  arguments: JSON.stringify({
                    headline: "Recuperación al día",
                    metrics: [],
                    interpretation: "Todo normal",
                    recommendation: "Sigue tu plan",
                    unavailableMetrics: [],
                  }),
                },
              },
            ],
          },
        },
      ],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    const message = await gateway.reply(request([], "¿Cómo está mi recuperación hoy?"), snapshot);

    expect(create).toHaveBeenCalledTimes(1);
    expect(message.planProposal).toBeUndefined();
  });

  it("no entra en loop infinito: se detiene en MAX_TOOL_TURNS aunque el modelo insista", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_x",
                type: "function",
                function: { name: "get_training_history", arguments: "{}" },
              },
            ],
          },
        },
      ],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    await gateway.reply(request(HISTORY), snapshot);

    // No debe superar el tope de vueltas definido internamente.
    expect(create.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("propose_training_plan y report_metrics siguen resolviéndose en una sola vuelta (sin tools de información)", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "report_metrics",
                  arguments: JSON.stringify({
                    headline: "Recuperación moderada.",
                    metrics: [],
                    period: snapshot.period,
                    lastSyncAt: snapshot.lastSyncAt,
                  }),
                },
              },
            ],
          },
        },
      ],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    const message = await gateway.reply(request([], "¿Cómo está mi recuperación?"), snapshot);

    expect(create).toHaveBeenCalledTimes(1);
    expect(message.analysis?.headline).toBe("Recuperación moderada.");
  });
});

describe("OpenAIAgentGateway — generateGuidance (Estado)", () => {
  const performanceSnapshot = buildDemoPerformanceSnapshotRecover(new Date("2026-08-06T12:00:00.000Z"));
  const assessment = assessPerformance(performanceSnapshot);

  it("usa la tool forzada y devuelve el guidance del modelo cuando responde bien", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "report_performance_guidance",
                  arguments: JSON.stringify({
                    todayMessage: "Tu recuperación está baja hoy.",
                    nextWorkoutAdvice: "Cambia la sesión por movilidad.",
                    weeklyApproach: "Baja el volumen el resto de la semana.",
                    motivationalLine: "Recuperar también suma.",
                  }),
                },
              },
            ],
          },
        },
      ],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    const guidance = await gateway.generateGuidance(assessment, performanceSnapshot);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].tool_choice).toEqual({
      type: "function",
      function: { name: "report_performance_guidance" },
    });
    expect(guidance.todayMessage).toBe("Tu recuperación está baja hoy.");
  });

  it("cae al fallback determinístico si el modelo no devuelve la tool esperada", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "texto libre sin tool_calls", tool_calls: [] } }],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    const guidance = await gateway.generateGuidance(assessment, performanceSnapshot);

    expect(guidance.todayMessage).toBeTruthy();
    expect(guidance.nextWorkoutAdvice).toBeTruthy();
  });

  it("cae al fallback determinístico si la llamada a la API falla", async () => {
    const create = vi.fn().mockRejectedValue(new Error("network error"));
    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    const guidance = await gateway.generateGuidance(assessment, performanceSnapshot);

    expect(guidance.todayMessage).toBeTruthy();
  });
});
