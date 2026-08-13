import { describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";
import {
  assessPerformance,
  buildDemoPerformanceSnapshotRecover,
  buildDemoSnapshot,
  emptyStructuredMemory,
  type ChatRequest,
} from "@ridelab/shared";
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
        // Primera vuelta libre: el modelo elige sólo responder en texto, advirtiendo sobre recuperación.
        choices: [
          {
            message: {
              role: "assistant",
              content: "Baja disposición hoy. Recovery time alto. Empieza con cargas moderadas.",
              tool_calls: [],
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
    // El texto de la primera vuelta no se pierde.
    expect(message.content).toBe("Baja disposición hoy. Recovery time alto. Empieza con cargas moderadas.");
    expect(message.error).toBeUndefined();
  });

  it("no fuerza una segunda vuelta si el mensaje no pedía un plan", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: "Tu recuperación está al día. Todo normal, sigue tu plan.",
            tool_calls: [],
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

  it("propose_training_plan y suggest_actions siguen resolviéndose en una sola vuelta (sin tools de información)", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: "Tu recuperación está moderada hoy. Bajaría un poco la intensidad.",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "suggest_actions",
                  arguments: JSON.stringify({
                    actions: [{ id: "a1", label: "Revisar mi estado", action: "open_status" }],
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
    expect(message.content).toBe("Tu recuperación está moderada hoy. Bajaría un poco la intensidad.");
    expect(message.suggestedActions).toEqual([{ id: "a1", label: "Revisar mi estado", action: "open_status" }]);
  });

  it("una pregunta general no llama get_current_status", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "El Pallof Press entrena el core anti-rotación.", tool_calls: [] } }],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    await gateway.reply(request([], "¿Para qué sirve el Pallof Press?"), snapshot);

    // El modelo eligió no llamar ninguna tool de info — confirma que la tool
    // está disponible pero es opcional, nunca forzada ni pre-resuelta.
    expect(create).toHaveBeenCalledTimes(1);
    const offeredTools = create.mock.calls[0][0].tools as Array<{ function: { name: string } }>;
    expect(offeredTools.map((t) => t.function.name)).toContain("get_current_status");
  });

  it("una pregunta de recuperación que llama get_current_status construye dataSources desde el resultado real, no desde el modelo", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                { id: "call_1", type: "function", function: { name: "get_current_status", arguments: "{}" } },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: "Hoy puedes apretar sin problema.", tool_calls: [] } }],
      });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    const message = await gateway.reply(request([], "¿Entreno fuerte hoy?"), snapshot);

    expect(message.dataSources?.some((source) => source.type === "garmin" && source.label === "Tu estado de hoy")).toBe(
      true,
    );
  });

  it("una pregunta sobre una sesión usa get_training_record y dataSources refleja sólo esa sesión", async () => {
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
        choices: [{ message: { role: "assistant", content: "Fue una sesión exigente.", tool_calls: [] } }],
      });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    const message = await gateway.reply(request(HISTORY, "¿Qué tal mi sesión del día 1?"), snapshot);

    expect(message.dataSources).toHaveLength(1);
    expect(message.dataSources?.[0]).toMatchObject({ type: "training_session", label: "Potencia de Empuje e Impacto" });
  });

  it("extrae followUpQuestion de la última oración cuando el modelo no llamó suggest_actions", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: "Mantendría las cargas de piernas. ¿Cómo terminaron tus antebrazos: frescos o cansados?",
            tool_calls: [],
          },
        },
      ],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    const message = await gateway.reply(request([], "¿Cómo estuvo mi entrenamiento?"), snapshot);

    expect(message.followUpQuestion).toContain("antebrazos");
  });

  it("inyecta memoryContext como system message adicional cuando se pasa", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "Mantendría el ajuste que acordamos.", tool_calls: [] } }],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    await gateway.reply(
      request([], "¿subo la carga hoy?"),
      snapshot,
      "MEMORIA DEL COACH — la semana pasada acordamos mantener la carga de piernas.",
    );

    const systemMessages = create.mock.calls[0][0].messages.filter((m: { role: string }) => m.role === "system");
    expect(systemMessages.some((m: { content: string }) => m.content.includes("acordamos mantener la carga"))).toBe(true);
  });

  it("no agrega ningún system message extra cuando memoryContext no se pasa", async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "Ok.", tool_calls: [] } }],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    await gateway.reply(request([], "hola"), snapshot);

    const messages = create.mock.calls[0][0].messages as Array<{ role: string; content: string }>;
    // Las 4 system messages de siempre (base, reglas, catálogo, contexto) + el turno del usuario.
    expect(messages.filter((m) => m.role === "system")).toHaveLength(4);
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

describe("OpenAIAgentGateway — summarizeMemory (memoria persistente)", () => {
  const previousSummary = emptyStructuredMemory();
  const newMessages = [
    { role: "user" as const, content: "quedé fresco de brazos, mantengamos la tracción" },
    { role: "assistant" as const, content: "Perfecto, mantengo la carga de piernas y subo un poco la tracción." },
  ];

  it("usa la tool forzada y devuelve la memoria actualizada del modelo", async () => {
    const updated = {
      ...emptyStructuredMemory(),
      decisions: ["mantener carga de piernas, subir levemente la tracción"],
    };
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "update_memory_summary", arguments: JSON.stringify(updated) } },
            ],
          },
        },
      ],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    const result = await gateway.summarizeMemory(previousSummary, newMessages);

    expect(create.mock.calls[0][0].tool_choice).toEqual({ type: "function", function: { name: "update_memory_summary" } });
    expect(result.decisions).toEqual(["mantener carga de piernas, subir levemente la tracción"]);
  });

  it("devuelve previousSummary sin cambios si el modelo no llama la tool esperada", async () => {
    const previous = { ...emptyStructuredMemory(), goals: ["bajar con más control"] };
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { role: "assistant", content: "texto libre sin tool_calls", tool_calls: [] } }],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    const result = await gateway.summarizeMemory(previous, newMessages);

    expect(result).toEqual(previous);
  });

  it("devuelve previousSummary sin cambios si la llamada a la API falla", async () => {
    const previous = { ...emptyStructuredMemory(), goals: ["bajar con más control"] };
    const create = vi.fn().mockRejectedValue(new Error("network error"));
    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));

    const result = await gateway.summarizeMemory(previous, newMessages);

    expect(result).toEqual(previous);
  });

  it("devuelve previousSummary sin cambios si la tool devuelve algo que no valida el schema", async () => {
    const previous = { ...emptyStructuredMemory(), goals: ["bajar con más control"] };
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              { id: "call_1", type: "function", function: { name: "update_memory_summary", arguments: JSON.stringify({ goals: "no es un array" }) } },
            ],
          },
        },
      ],
    });

    const gateway = new OpenAIAgentGateway("test-key", "gpt-4o", fakeClient(create));
    const result = await gateway.summarizeMemory(previous, newMessages);

    expect(result).toEqual(previous);
  });
});
