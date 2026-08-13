import OpenAI from "openai";
import { z } from "zod";
import {
  buildCatalogPrompt,
  CATALOG_IDS,
  COACH_BASE_INSTRUCTIONS,
  COACH_OPERATIONAL_RULES,
  fallbackGuidance,
  looksLikePlanRequest,
  performanceGuidanceSchema,
  suggestedActionSchema,
  validateTrainingPlan,
  type ChatMessage,
  type ChatRequest,
  type GarminSnapshot,
  type HistoricalMetricsDay,
  type PerformanceAssessment,
  type PerformanceGuidance,
  type PerformanceSnapshot,
} from "@ridelab/shared";
import { newMessageId, type AgentGateway } from "./gateway";
import { getTrainingHistoryTool, getTrainingRecordTool } from "./training-history-tools";
import { config } from "../config";

/** Tools de sólo información: el modelo necesita su resultado para seguir, no son terminales. */
const INFO_TOOL_NAMES = new Set([
  "get_current_status",
  "get_training_history",
  "get_training_record",
  "get_historical_metrics",
]);
/** Tope de vueltas de tool-calling, para no quedar en loop si el modelo insiste en pedir info. */
const MAX_TOOL_TURNS = 4;

const suggestActionsArgsSchema = z.object({
  actions: z.array(suggestedActionSchema).max(3).default([]),
  followUpQuestion: z.string().optional(),
});

/**
 * Coach real sobre OpenAI.
 *
 * Verificado contra la API real (requiere `OPENAI_API_KEY`): `propose_training_plan`
 * el 2026-08-05, y el loop de tool-calling de `get_training_history`/
 * `get_training_record` el 2026-08-06 (el modelo pidió el historial, recibió
 * el resultado en la segunda vuelta y lo usó para distinguir "iniciada" de
 * "completada" sin inventar el vínculo con Garmin). Con `MOCK_MODE=true` esta
 * clase no se instancia.
 *
 * El plan nunca se reconstruye leyendo Markdown: llega por la tool
 * `propose_training_plan` y se valida con Zod antes de devolverlo.
 *
 * La respuesta conversacional (`content`) viene siempre del texto libre del
 * modelo, nunca de una tool — el Coach no responde como informe. Las tools de
 * información (`get_current_status`, `get_training_history`,
 * `get_training_record`, `get_historical_metrics`) existen para que el
 * modelo pida datos bajo demanda: a diferencia de `propose_training_plan`
 * (cuyos argumentos SON la respuesta), el modelo necesita su resultado de
 * vuelta para poder responder — por eso `reply()` hace un loop real de
 * tool-calling en vez de resolver todo en una sola vuelta. `dataSources` se
 * construye después, a partir de qué tools de información se llamaron
 * realmente ese turno — nunca se le confía al modelo qué dice haber usado.
 */
export class OpenAIAgentGateway implements AgentGateway {
  readonly name = "OpenAIAgentGateway";

  private readonly client: OpenAI;

  constructor(
    apiKey: string = config.openai.apiKey,
    private readonly model = config.openai.model,
    client?: OpenAI,
    /** Resuelve `get_historical_metrics`. `undefined` si el proveedor no lo soporta (la tool no se ofrece). */
    private readonly historicalMetrics?: (params: {
      startDate: string;
      endDate: string;
    }) => Promise<HistoricalMetricsDay[]>,
  ) {
    if (!apiKey) throw new Error("OPENAI_API_KEY es obligatoria para OpenAIAgentGateway");
    this.client = client ?? new OpenAI({ apiKey });
  }

  async reply(request: ChatRequest, snapshot: GarminSnapshot, memoryContext?: string): Promise<ChatMessage> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: COACH_BASE_INSTRUCTIONS },
      { role: "system", content: COACH_OPERATIONAL_RULES },
      { role: "system", content: buildCatalogPrompt() },
      { role: "system", content: this.buildContext(request, snapshot) },
      ...(memoryContext ? [{ role: "system", content: memoryContext } as const] : []),
      ...request.messages.map((m) => ({ role: m.role, content: m.content }) as const),
    ];

    const tools: OpenAI.ChatCompletionTool[] = [
      { type: "function", function: PROPOSE_TRAINING_PLAN_TOOL },
      { type: "function", function: SUGGEST_ACTIONS_TOOL },
      { type: "function", function: GET_CURRENT_STATUS_TOOL },
      { type: "function", function: GET_TRAINING_HISTORY_TOOL },
      { type: "function", function: GET_TRAINING_RECORD_TOOL },
      ...(this.historicalMetrics ? [{ type: "function", function: GET_HISTORICAL_METRICS_TOOL } as const] : []),
    ];

    let choice: OpenAI.ChatCompletion.Choice | undefined;
    // Traza real de qué tools de información se llamaron este turno — de acá
    // sale `dataSources`, nunca de lo que el modelo diga que usó.
    const resolvedInfoCalls: Array<{ name: string; result: unknown }> = [];

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const completion = await this.client.chat.completions.create({ model: this.model, messages, tools });
      choice = completion.choices[0];
      const calls = choice?.message?.tool_calls ?? [];
      const infoCalls = calls.filter((call) => call.type === "function" && INFO_TOOL_NAMES.has(call.function.name));

      if (infoCalls.length === 0) break;

      // El mensaje del asistente con los tool_calls debe ir antes de sus resultados.
      messages.push(choice!.message as OpenAI.ChatCompletionMessageParam);
      for (const call of infoCalls) {
        if (call.type !== "function") continue;
        let args: unknown = {};
        try {
          args = JSON.parse(call.function.arguments);
        } catch {
          // Argumentos vacíos: la tool resuelve con lo que tenga (sin filtros).
        }
        const result = await this.resolveInfoTool(call.function.name, args, request.trainingHistory, snapshot);
        resolvedInfoCalls.push({ name: call.function.name, result });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    const base = {
      id: newMessageId(),
      role: "assistant" as const,
      createdAt: new Date().toISOString(),
      isDemoData: snapshot.dataSource === "mock",
    };

    const toolCalls = (choice?.message?.tool_calls ?? []).filter(
      (call) => call.type !== "function" || !INFO_TOOL_NAMES.has(call.function.name),
    );
    let planProposal: ChatMessage["planProposal"];
    let suggestedActions: ChatMessage["suggestedActions"] = [];
    let followUpQuestion: string | undefined;
    const errors: string[] = [];

    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      let args: unknown;
      try {
        args = JSON.parse(call.function.arguments);
      } catch {
        errors.push(`La herramienta ${call.function.name} devolvió JSON inválido`);
        continue;
      }

      if (call.function.name === "propose_training_plan") {
        const built = this.buildPlanProposal(args);
        if (built.ok) planProposal = built.planProposal;
        else errors.push(built.error);
      }

      if (call.function.name === "suggest_actions") {
        const parsed = suggestActionsArgsSchema.safeParse(args);
        // Fallo silencioso a propósito: las acciones son un agregado, nunca un
        // requisito de la respuesta — que el modelo se equivoque acá no debe
        // ensuciar `errors` ni la conversación con el usuario.
        if (parsed.success) {
          suggestedActions = parsed.data.actions;
          followUpQuestion = parsed.data.followUpQuestion;
        }
      }
    }

    const content = choice?.message?.content ?? "";
    if (!followUpQuestion) {
      // El modelo no llamó `suggest_actions` (o no confirmó la pregunta) pero
      // igual puede haber terminado con una — se extrae de la última oración.
      const trailingQuestion = content.match(/([^.!?\n]*\?)\s*$/);
      if (trailingQuestion) followUpQuestion = trailingQuestion[1].trim();
    }

    // Red de seguridad: el pedido de plan es inequívoco pero el modelo, con
    // elección libre, decidió responder sólo con texto — se verificó contra
    // la API real que ni instrucciones explícitas evitan esto siempre
    // (Garmin marcando baja disposición lo empuja a advertir en vez de
    // entregar el plan). Una segunda vuelta con `propose_training_plan`
    // forzada por `tool_choice` no deja margen a esa elección.
    const lastUserMessage = [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    if (!planProposal && looksLikePlanRequest(lastUserMessage)) {
      const forced = await this.forcePlanProposal(messages, choice);
      if (forced.ok) planProposal = forced.planProposal;
      else errors.push(forced.error);
    }

    const dataSources = this.buildDataSources(resolvedInfoCalls);

    return {
      ...base,
      content,
      dataSources,
      suggestedActions,
      followUpQuestion,
      planProposal,
      error: errors.length ? errors.join(" · ") : undefined,
    };
  }

  /**
   * Convierte la traza de tools de información realmente llamadas en
   * `dataSources` — nunca a partir de lo que el modelo reporte, siempre de
   * los resultados reales que ya se le devolvieron. Descarta duplicados
   * exactos (el modelo pidiendo lo mismo dos veces en el mismo turno).
   */
  private buildDataSources(
    resolvedInfoCalls: Array<{ name: string; result: unknown }>,
  ): NonNullable<ChatMessage["dataSources"]> {
    const seen = new Set<string>();
    const sources: NonNullable<ChatMessage["dataSources"]> = [];

    for (const call of resolvedInfoCalls) {
      const source = this.describeDataSource(call.name, call.result);
      if (!source) continue;
      const key = `${source.type}::${source.label}::${source.detail ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push(source);
    }

    return sources;
  }

  private describeDataSource(name: string, result: unknown): NonNullable<ChatMessage["dataSources"]>[number] | undefined {
    if (name === "get_current_status") {
      const status = result as { trainingReadiness?: { score?: number }; sleep?: { score?: number } } | null;
      const detail =
        status?.trainingReadiness?.score !== undefined
          ? `Training Readiness ${status.trainingReadiness.score}/100`
          : status?.sleep?.score !== undefined
            ? `Sueño ${status.sleep.score}/100`
            : undefined;
      return { type: "garmin", label: "Tu estado de hoy", detail };
    }

    if (name === "get_training_record") {
      const entry = result as {
        plannedTitle?: string;
        garminDurationSeconds?: number;
        actualRpe?: number;
        garminAverageHeartRate?: number;
        garminAerobicTrainingEffect?: number;
      } | null;
      if (!entry) return undefined;
      const detail = [
        entry.garminDurationSeconds !== undefined
          ? `${Math.floor(entry.garminDurationSeconds / 60)} min ${Math.round(entry.garminDurationSeconds % 60)} s`
          : undefined,
        entry.actualRpe !== undefined ? `RPE ${entry.actualRpe}/10` : undefined,
        entry.garminAverageHeartRate !== undefined ? `${entry.garminAverageHeartRate} ppm promedio` : undefined,
        entry.garminAerobicTrainingEffect !== undefined
          ? `Training Effect ${entry.garminAerobicTrainingEffect} aeróbico`
          : undefined,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" · ");
      return { type: "training_session", label: entry.plannedTitle ?? "Sesión", detail: detail || undefined };
    }

    if (name === "get_training_history") {
      return { type: "training_history", label: "Historial de entrenamiento" };
    }

    if (name === "get_historical_metrics") {
      return { type: "garmin", label: "Métricas históricas" };
    }

    return undefined;
  }

  /**
   * Segunda vuelta con `propose_training_plan` forzado por `tool_choice`, para
   * cuando la primera vuelta libre no lo produjo pero el pedido era
   * inequívoco. Reutiliza el historial ya armado (incluida la respuesta
   * anterior del modelo, si la hubo) para no perder el análisis que ya dio.
   */
  private async forcePlanProposal(
    messages: OpenAI.ChatCompletionMessageParam[],
    previousChoice: OpenAI.ChatCompletion.Choice | undefined,
  ): Promise<{ ok: true; planProposal: NonNullable<ChatMessage["planProposal"]> } | { ok: false; error: string }> {
    const nudgedMessages: OpenAI.ChatCompletionMessageParam[] = [...messages];
    if (previousChoice?.message?.content) {
      // Se registra la respuesta anterior como turno propio, no se descarta:
      // si ya advirtió sobre la recuperación, esa nota puede pasar al `summary`.
      nudgedMessages.push({ role: "assistant", content: previousChoice.message.content });
    }
    nudgedMessages.push({
      role: "system",
      content:
        "El usuario pidió explícitamente que le entregues un plan. Constrúyelo ahora con `propose_training_plan`, incorporando cualquier advertencia de recuperación como ajuste dentro del plan (carga, RPE, loadGuidance) — no como motivo para no entregarlo.",
    });

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: nudgedMessages,
        tools: [{ type: "function", function: PROPOSE_TRAINING_PLAN_TOOL }],
        tool_choice: { type: "function", function: { name: "propose_training_plan" } },
      });
      const call = completion.choices[0]?.message?.tool_calls?.[0];
      if (call?.type !== "function" || call.function.name !== "propose_training_plan") {
        return { ok: false, error: "El coach no pudo generar el plan pedido" };
      }
      const args: unknown = JSON.parse(call.function.arguments);
      return this.buildPlanProposal(args);
    } catch (error) {
      console.warn("[openai] forcePlanProposal falló:", error instanceof Error ? error.message : error);
      return { ok: false, error: "El coach no pudo generar el plan pedido" };
    }
  }

  /** Valida los argumentos de `propose_training_plan` — un plan inválido nunca se persiste ni se muestra como si lo fuera. */
  private buildPlanProposal(
    args: unknown,
  ): { ok: true; planProposal: NonNullable<ChatMessage["planProposal"]> } | { ok: false; error: string } {
    const candidate = (args as { plan?: unknown; summary?: unknown }).plan ?? args;
    const result = validateTrainingPlan(candidate);
    if (!result.ok) {
      return { ok: false, error: `El plan propuesto no pasó la validación: ${result.errors.join("; ")}` };
    }
    const unknownExercise = this.findUnknownExercise(result.plan);
    if (unknownExercise) {
      return { ok: false, error: `El plan referencia un ejercicio fuera del catálogo: ${unknownExercise}` };
    }
    return {
      ok: true,
      planProposal: {
        plan: result.plan,
        summary:
          typeof (args as { summary?: unknown }).summary === "string"
            ? (args as { summary: string }).summary
            : `${result.plan.durationWeeks} semanas · ${result.plan.daysPerWeek} días por semana`,
      },
    };
  }

  /**
   * Mensaje de Estado. El agente nunca decide el nivel — eso ya lo resolvió
   * `PerformanceAssessmentService` antes de llegar acá; sólo redacta sobre el
   * resultado. Si el modelo falla o devuelve algo que no valida, cae al mismo
   * fallback determinístico que usa `MockAgentGateway`.
   */
  async generateGuidance(
    assessment: PerformanceAssessment,
    snapshot: PerformanceSnapshot,
    subjectiveNote?: string,
  ): Promise<PerformanceGuidance> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: COACH_BASE_INSTRUCTIONS },
          { role: "system", content: PERFORMANCE_GUIDANCE_INSTRUCTIONS },
          { role: "user", content: this.buildGuidanceContext(assessment, snapshot, subjectiveNote) },
        ],
        tools: [{ type: "function", function: REPORT_PERFORMANCE_GUIDANCE_TOOL }],
        tool_choice: { type: "function", function: { name: "report_performance_guidance" } },
      });

      const call = completion.choices[0]?.message?.tool_calls?.[0];
      if (call?.type === "function" && call.function.name === "report_performance_guidance") {
        const parsed = performanceGuidanceSchema.safeParse(JSON.parse(call.function.arguments));
        if (parsed.success) return parsed.data;
      }
    } catch (error) {
      console.warn("[openai] generateGuidance falló, usando fallback:", error instanceof Error ? error.message : error);
    }

    return fallbackGuidance(assessment);
  }

  private buildGuidanceContext(
    assessment: PerformanceAssessment,
    snapshot: PerformanceSnapshot,
    subjectiveNote?: string,
  ): string {
    return [
      `Assessment ya calculado (no lo cuestiones ni lo cambies, sólo redacta sobre él): ${JSON.stringify(assessment)}`,
      `Métricas disponibles que respaldan el assessment: ${JSON.stringify({
        trainingReadiness: snapshot.trainingReadiness,
        sleep: snapshot.sleep,
        hrv: snapshot.hrv,
        bodyBattery: snapshot.bodyBattery,
        recovery: snapshot.recovery,
        acuteLoad: snapshot.acuteLoad,
      })}`,
      snapshot.missingMetrics.length
        ? `Métricas NO disponibles, no las menciones como si existieran: ${snapshot.missingMetrics.join(", ")}`
        : "",
      snapshot.source === "mock" ? "IMPORTANTE: son datos de demostración, no reales." : "",
      subjectiveNote
        ? `Nota subjetiva del atleta hoy (auto-reportada, NO es una métrica de Garmin — puede matizar el mensaje pero nunca contradecir el nivel ya calculado): "${subjectiveNote}"`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private findUnknownExercise(plan: Parameters<typeof validateTrainingPlan>[0] extends never ? never : { weeks: Array<{ sessions: Array<{ sections: Array<{ exercises: Array<{ catalogExerciseId: string }> }> }> }> }): string | undefined {
    const valid = new Set<string>(CATALOG_IDS);
    for (const week of plan.weeks) {
      for (const session of week.sessions) {
        for (const section of session.sections) {
          for (const exercise of section.exercises) {
            if (!valid.has(exercise.catalogExerciseId)) return exercise.catalogExerciseId;
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Resuelve una tool de información. `get_current_status` sólo expone el
   * `snapshot` que `reply()` ya recibió como parámetro — no dispara una
   * segunda llamada a Garmin, sólo decide si el modelo llega a verlo.
   * `get_training_history`/`get_training_record` son puras (sólo filtran el
   * `trainingHistory` que ya llegó en la petición); `get_historical_metrics`
   * sí hace I/O real contra Garmin, por eso el método es async. Ninguna se
   * inyecta de antemano en el prompt — sólo llegan al modelo si las pide
   * explícitamente.
   */
  private async resolveInfoTool(
    name: string,
    args: unknown,
    trainingHistory: ChatRequest["trainingHistory"],
    snapshot: GarminSnapshot,
  ): Promise<unknown> {
    if (name === "get_current_status") {
      return {
        sleep: snapshot.sleep,
        hrv: snapshot.hrv,
        bodyBattery: snapshot.bodyBattery,
        trainingReadiness: snapshot.trainingReadiness,
        restingHeartRate: snapshot.restingHeartRate,
        stress: snapshot.stress,
        unavailableMetrics: snapshot.unavailableMetrics,
        isDemoData: snapshot.dataSource === "mock",
      };
    }
    if (name === "get_training_history") {
      const parsed = args as { startDate?: string; endDate?: string; includeGarminMetrics?: boolean };
      return getTrainingHistoryTool(trainingHistory, parsed);
    }
    if (name === "get_training_record") {
      const parsed = args as { sessionId: string };
      return getTrainingRecordTool(trainingHistory, parsed);
    }
    if (name === "get_historical_metrics") {
      const parsed = args as { startDate?: string; endDate?: string };
      if (!this.historicalMetrics || !parsed.startDate || !parsed.endDate) return [];
      try {
        return await this.historicalMetrics({ startDate: parsed.startDate, endDate: parsed.endDate });
      } catch (error) {
        console.warn("[openai] get_historical_metrics falló:", error instanceof Error ? error.message : error);
        return [];
      }
    }
    return null;
  }

  /**
   * Contexto factual liviano — a propósito ya NO vuelca el snapshot completo
   * de Garmin: eso ahora se pide bajo demanda con `get_current_status`, para
   * que la consulta a Garmin sea invisible en la conversación y sólo ocurra
   * cuando de verdad ayuda a la respuesta.
   */
  private buildContext(request: ChatRequest, snapshot: GarminSnapshot): string {
    const profile = request.athleteProfile;
    const logs = request.recentLogs.slice(-5);

    return [
      `Tienes \`get_current_status\` para ver el estado de hoy del usuario (sueño, HRV, Body Battery, Training Readiness, FC en reposo, estrés) y \`get_historical_metrics\`/\`get_training_history\`/\`get_training_record\` para historial — pídelas sólo si la pregunta realmente las necesita, no las consultes "porque están disponibles".`,
      snapshot.dataSource === "mock"
        ? "IMPORTANTE: la cuenta de Garmin conectada es de demostración. Si consultas el estado, adviértelo de forma natural y no lo presentes como datos reales."
        : "",
      profile ? `Perfil del atleta ya conocido (no vuelvas a preguntar esto): ${JSON.stringify(profile)}` : "",
      logs.length ? `Sesiones registradas recientemente: ${JSON.stringify(logs)}` : "El usuario aún no registra sesiones.",
      request.subjectiveNotes.length
        ? `Notas subjetivas recientes del atleta (auto-reportadas, NO son métricas de Garmin — úsalas como contexto cualitativo, nunca las confundas con datos medidos): ${JSON.stringify(
            request.subjectiveNotes.map((n) => ({ date: n.date, note: n.note })),
          )}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }
}

/** Schema JSON de `propose_training_plan`, espejo del schema Zod de shared. */
const PROPOSE_TRAINING_PLAN_TOOL = {
  name: "propose_training_plan",
  description:
    "Entrega un plan de entrenamiento estructurado y persistible. Úsala SIEMPRE que crees o ajustes un plan. Nunca entregues el plan sólo como texto.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["plan", "summary"],
    properties: {
      summary: { type: "string", description: "Resumen corto para la tarjeta del chat" },
      plan: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "goal",
          "sport",
          "durationWeeks",
          "daysPerWeek",
          "sessionDurationMinutes",
          "startDate",
          "generatedAt",
          "sourceContext",
          "weeks",
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          goal: { type: "string" },
          sport: { type: "string" },
          durationWeeks: { type: "integer", minimum: 1, maximum: 52 },
          daysPerWeek: { type: "integer", minimum: 1, maximum: 7 },
          sessionDurationMinutes: { type: "integer", minimum: 1 },
          startDate: { type: "string", description: "YYYY-MM-DD" },
          generatedAt: { type: "string", description: "ISO 8601" },
          sourceContext: {
            type: "object",
            additionalProperties: false,
            required: ["userGoals", "limitations", "equipment"],
            properties: {
              garminPeriod: { type: "string" },
              userGoals: { type: "array", items: { type: "string" } },
              limitations: { type: "array", items: { type: "string" } },
              equipment: { type: "array", items: { type: "string" } },
            },
          },
          weeks: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["number", "objective", "sessions"],
              properties: {
                number: { type: "integer", minimum: 1 },
                objective: { type: "string" },
                sessions: {
                  type: "array",
                  minItems: 1,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "dayLabel", "title", "focus", "estimatedMinutes", "sections"],
                    properties: {
                      id: { type: "string" },
                      dayLabel: { type: "string" },
                      title: { type: "string" },
                      focus: { type: "string" },
                      estimatedMinutes: { type: "integer", minimum: 1 },
                      scheduledDate: { type: "string" },
                      sections: {
                        type: "array",
                        minItems: 1,
                        items: {
                          type: "object",
                          additionalProperties: false,
                          required: ["id", "title", "order", "exercises"],
                          properties: {
                            id: { type: "string" },
                            title: { type: "string" },
                            order: { type: "integer", minimum: 0 },
                            exercises: {
                              type: "array",
                              minItems: 1,
                              items: {
                                type: "object",
                                additionalProperties: false,
                                required: ["id", "catalogExerciseId", "name", "why", "techniqueCues"],
                                properties: {
                                  id: { type: "string" },
                                  catalogExerciseId: {
                                    type: "string",
                                    enum: CATALOG_IDS,
                                    description: "Debe ser un ID del catálogo. No inventes ejercicios.",
                                  },
                                  name: { type: "string" },
                                  why: { type: "string" },
                                  sets: { type: "integer", minimum: 1 },
                                  reps: { type: "string" },
                                  durationSeconds: { type: "integer", minimum: 1 },
                                  distanceMeters: { type: "number", minimum: 1 },
                                  restSeconds: { type: "integer", minimum: 0 },
                                  rpe: { type: "string" },
                                  loadGuidance: { type: "string" },
                                  techniqueCues: { type: "array", items: { type: "string" } },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * Schema JSON de `suggest_actions`: NO forzada, el modelo la llama sólo
 * cuando hay 0-3 acciones contextuales relevantes o quiere confirmar una
 * pregunta de seguimiento — nunca reemplaza el texto natural de la
 * respuesta, viaja aparte de él.
 */
const SUGGEST_ACTIONS_TOOL = {
  name: "suggest_actions",
  description:
    "Ofrece hasta 3 acciones contextuales relacionadas con tu respuesta (sólo si de verdad son relevantes) y, si terminaste con una pregunta, confírmala en followUpQuestion. No la llames en cada turno — sólo cuando aporte.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      actions: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "label", "action"],
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            action: {
              type: "string",
              enum: ["adjust_next_session", "open_session", "compare_session", "show_used_data", "open_status"],
            },
            targetId: { type: "string", description: "Id de la sesión o plan al que apunta la acción, si aplica" },
          },
        },
      },
      followUpQuestion: {
        type: "string",
        description: "La pregunta con la que terminaste tu respuesta, si hiciste una",
      },
    },
  },
} as const;

/**
 * Schema JSON de `get_current_status`: tool de INFORMACIÓN sobre el estado de
 * HOY (sueño, HRV, Body Battery, Training Readiness, FC en reposo, estrés).
 * Reemplaza el volcado automático del snapshot en el prompt — la consulta a
 * Garmin ahora es invisible y sólo ocurre si el modelo la pide.
 */
const GET_CURRENT_STATUS_TOOL = {
  name: "get_current_status",
  description:
    "Devuelve el estado actual del usuario (sueño, HRV, Body Battery, Training Readiness, FC en reposo, estrés). Úsala sólo cuando la pregunta dependa de su recuperación o disposición para entrenar hoy — no la llames para preguntas generales, de técnica, o que ya tienen suficiente contexto en la conversación.",
  parameters: { type: "object", additionalProperties: false, properties: {} },
} as const;

/**
 * Schema JSON de `get_training_history`: tool de INFORMACIÓN, no terminal.
 * Su resultado se le devuelve al modelo en un segundo turno — no se inyecta
 * en el prompt de antemano, así se cumple "no enviar todo el historial en
 * cada mensaje".
 */
const GET_TRAINING_HISTORY_TOOL = {
  name: "get_training_history",
  description:
    "Devuelve el historial combinado (lo planificado, lo ejecutado en la app y los datos Garmin vinculados) del rango de fechas pedido, incluidas actividades libres sin sesión asociada. Úsala antes de responder preguntas sobre cumplimiento, progreso, carga de entrenamiento, o comparación entre lo planificado y lo realizado.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      startDate: { type: "string", description: "YYYY-MM-DD, inicio del rango" },
      endDate: { type: "string", description: "YYYY-MM-DD, fin del rango" },
      includeGarminMetrics: {
        type: "boolean",
        description: "Si es false, omite los campos de Garmin (por defecto true)",
      },
    },
  },
} as const;

/** Schema JSON de `get_training_record`: el registro combinado de una sesión planificada puntual. */
const GET_TRAINING_RECORD_TOOL = {
  name: "get_training_record",
  description:
    "Devuelve el registro combinado (planificado + ejecutado + Garmin) de una sesión planificada específica, por su id. Úsala cuando el usuario pregunte por una sesión puntual.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["sessionId"],
    properties: {
      sessionId: { type: "string", description: "Id de la sesión planificada" },
    },
  },
} as const;

/**
 * Schema JSON de `get_historical_metrics`: tool de INFORMACIÓN sobre un día u
 * rango puntual de métricas Garmin (sueño, HRV, Training Readiness, estrés) —
 * a diferencia del snapshot de "hoy" que ya viene en el contexto. Sólo se
 * ofrece cuando el backend tiene un proveedor Garmin real conectado.
 */
const GET_HISTORICAL_METRICS_TOOL = {
  name: "get_historical_metrics",
  description:
    "Devuelve un resumen diario (puntaje de sueño, HRV, Training Readiness, estrés promedio) para cada día del rango pedido. Úsala cuando te pregunten por un día específico que no sea hoy (ej. \"antes de ayer\", \"el lunes pasado\") o por una tendencia de varios días — el snapshot de contexto sólo trae el día de hoy.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["startDate", "endDate"],
    properties: {
      startDate: { type: "string", description: "YYYY-MM-DD, inicio del rango (inclusive)" },
      endDate: { type: "string", description: "YYYY-MM-DD, fin del rango (inclusive)" },
    },
  },
} as const;

/** Instrucciones específicas para el mensaje de Estado — no reemplazan las reglas base. */
const PERFORMANCE_GUIDANCE_INSTRUCTIONS = `Vas a redactar el mensaje de la sección "Estado". El nivel (push/solid/controlled/recover/insufficient) ya fue calculado por un motor determinístico — jamás lo cuestiones, cambies ni contradigas.

Usa EXCLUSIVAMENTE las métricas que se te entregan. Nunca inventes una métrica ni un número que no venga en el contexto.

Distingue dato observado de interpretación de recomendación. No diagnostiques. No afirmes que Garmin mide fuerza muscular: "con fuerza" es una etiqueta de preparación deportiva, no una medición directa.

Responde en español, directo y práctico. Evita frases motivacionales genéricas ("¡tú puedes!", "cada día es una oportunidad"). Máximo tres frases por bloque de la tool.`;

/** Schema JSON de `report_performance_guidance`: los 4 bloques de `PerformanceGuidance`. */
const REPORT_PERFORMANCE_GUIDANCE_TOOL = {
  name: "report_performance_guidance",
  description: "Entrega el mensaje de Estado en sus 4 bloques. Úsala siempre para responder.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["todayMessage", "nextWorkoutAdvice", "weeklyApproach", "motivationalLine"],
    properties: {
      todayMessage: { type: "string", description: "Cómo está el usuario hoy, máximo 3 frases" },
      nextWorkoutAdvice: { type: "string", description: "Cómo abordar la próxima sesión, máximo 3 frases" },
      weeklyApproach: { type: "string", description: "Cómo gestionar la carga de la semana, máximo 3 frases" },
      motivationalLine: { type: "string", description: "Una frase directa, no genérica" },
    },
  },
} as const;
