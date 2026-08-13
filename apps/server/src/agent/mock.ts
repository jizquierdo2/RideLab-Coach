import {
  buildDemoPlan,
  fallbackGuidance,
  needsPainEscalation,
  PAIN_ESCALATION_MESSAGE,
  type ChatMessage,
  type ChatRequest,
  type GarminSnapshot,
  type PerformanceAssessment,
  type PerformanceGuidance,
} from "@ridelab/shared";
import { newMessageId, type AgentGateway } from "./gateway";
import { resolveAthleteProfile } from "./profile";

const PLAN_KEYWORDS = ["plan", "planifica", "prográmame", "programame", "rutina"] as const;

/** Encabezado de las preguntas del plan, usado para reconocer el flujo en curso. */
const PLAN_QUESTIONS_PREFIX = "Para armarte un plan seguro";

/** El usuario niega tener molestias. */
const DENIES_PAIN =
  /\b(ningun[ao]|sin (dolor|molestias?|lesiones)|no (tengo|hay|siento) (dolor|molestias?|lesiones|nada)|no me duele|nada que reportar)\b/;

/** El usuario afirma tener dolor. */
const ASSERTS_PAIN =
  /\b(me duele|tengo dolor|siento dolor|con dolor|me molesta|tengo (una )?(molestia|lesi[óo]n))\b/;

type MockReply = Pick<ChatMessage, "content" | "dataSources" | "suggestedActions" | "planProposal">;

/**
 * Coach simulado que impulsa el modo demo.
 *
 * No inventa métricas: todo lo que reporta sale del snapshot que recibe, y si un
 * dato no está, lo dice. Reconoce las intenciones de las sugerencias rápidas y
 * cubre el flujo completo de creación de plan, incluidas las preguntas mínimas.
 * Responde en prosa conversacional, igual que el coach real — nunca arma una
 * tarjeta de informe.
 */
export class MockAgentGateway implements AgentGateway {
  readonly name = "MockAgentGateway";

  /** `memoryContext` no se usa: el mock es determinístico por palabra clave, no consulta memoria persistente. */
  async reply(request: ChatRequest, snapshot: GarminSnapshot, _memoryContext?: string): Promise<ChatMessage> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
    const text = (lastUser?.content ?? "").toLowerCase();

    const base = {
      id: newMessageId(),
      role: "assistant" as const,
      createdAt: new Date().toISOString(),
      isDemoData: snapshot.dataSource === "mock",
    };

    // "cumplí mi plan" contiene la palabra "plan", así que este chequeo debe ir
    // ANTES del de creación de plan para no confundir una consulta de
    // cumplimiento con el inicio del flujo de armar un plan nuevo.
    if (
      !this.isAnsweringPlanQuestions(request) &&
      this.matches(text, [
        "cumplí",
        "cumpli",
        "cumplimiento",
        "compara lo planificado",
        "planificado con lo realizado",
        "cuántas sesiones",
        "cuantas sesiones",
      ])
    ) {
      return { ...base, ...this.trainingHistorySummary(request) };
    }
    // Si el turno anterior fueron las preguntas del plan, este mensaje es la
    // respuesta a esas preguntas: sigue en el flujo del plan aunque mencione
    // palabras que en otro contexto activarían otra intención.
    if (this.isAnsweringPlanQuestions(request) || this.matches(text, PLAN_KEYWORDS)) {
      return { ...base, ...this.planTurn(request, snapshot) };
    }
    if (this.matches(text, ["última salida", "ultima salida", "bicicleta", "analiza", "salida"])) {
      return { ...base, ...this.lastRide(snapshot) };
    }
    if (this.matches(text, ["compárame", "comparame", "cuatro semanas", "4 semanas", "tendencia"])) {
      return { ...base, ...this.trend(snapshot) };
    }
    if (this.matches(text, ["adapta", "ajusta", "modifica"])) {
      return { ...base, ...this.adaptSession(snapshot) };
    }
    if (this.matches(text, ["progres", "peso ocupé", "peso ocupe", "última vez", "ultima vez"])) {
      return { ...base, ...this.progress(request) };
    }
    if (this.matches(text, ["dolor", "molestia", "lesión", "lesion", "duele"])) {
      return { ...base, content: this.painResponse(request, text), dataSources: [], suggestedActions: [] };
    }

    // Por defecto: recuperación de hoy, que es la pregunta central del producto.
    return { ...base, ...this.recovery(snapshot) };
  }

  /** Determinístico: el Mock nunca improvisa guidance, siempre usa el fallback de shared. */
  async generateGuidance(assessment: PerformanceAssessment): Promise<PerformanceGuidance> {
    return fallbackGuidance(assessment);
  }

  private matches(text: string, needles: readonly string[]): boolean {
    return needles.some((needle) => text.includes(needle));
  }

  /** ¿El coach acaba de pedir los datos del perfil? */
  private isAnsweringPlanQuestions(request: ChatRequest): boolean {
    const lastAssistant = [...request.messages].reverse().find((m) => m.role === "assistant");
    return Boolean(lastAssistant?.content.startsWith(PLAN_QUESTIONS_PREFIX));
  }

  private formatMinutes(minutes: number | undefined): string | undefined {
    if (minutes === undefined) return undefined;
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
  }

  private recovery(snapshot: GarminSnapshot): MockReply {
    const score = snapshot.trainingReadiness?.score;
    const sleepText = this.formatMinutes(snapshot.sleep?.durationMinutes);
    const sleepBelowAvg = (snapshot.sleep?.vsAverageMinutes ?? 0) < -30;
    const hrvDelta = snapshot.hrv?.vsBaselinePercent;

    let content: string;
    if (score === undefined) {
      content =
        "No tengo tu Training Readiness de hoy, así que no puedo darte un veredicto de recuperación con criterio. " +
        "Sincroniza el reloj y cuéntame cómo te sientes, y partimos de ahí.";
    } else if (score >= 75) {
      content =
        `Hoy tienes buena recuperación${sleepText ? `, dormiste ${sleepText}` : ""}${
          hrvDelta !== undefined ? ` y tu HRV está ${hrvDelta >= 0 ? "dentro" : "apenas por debajo"} de tu línea base` : ""
        }. Puedes ir por la sesión completa: es un buen día para apretar en piernas y potencia, que es justo lo que te da margen en bajadas exigentes.`;
    } else if (score >= 50) {
      content =
        `Tu recuperación hoy es moderada${sleepBelowAvg ? " — dormiste menos que tu promedio" : ""}. ` +
        "Mantendría la sesión pero bajaría cerca de un 10% la intensidad, sobre todo en lo más explosivo. No hace falta reventarse; hoy importa ejecutar bien.";
    } else {
      content =
        "Tu recuperación no está para buscar máximos hoy. " +
        "Prioriza movilidad o un trabajo suave de técnica y deja la carga fuerte para mañana — forzarlo ahora sólo te deja peor para la próxima salida.";
    }

    return {
      content,
      dataSources:
        score !== undefined
          ? [{ type: "garmin", label: "Tu estado de hoy", detail: `Training Readiness ${score}/100` }]
          : [],
      suggestedActions:
        score !== undefined ? [{ id: "action-open-status", label: "Revisar mi estado", action: "open_status" }] : [],
    };
  }

  private lastRide(snapshot: GarminSnapshot): MockReply {
    const ride = snapshot.recentActivities.find((a) => a.type.includes("bik") || a.type.includes("cycl"));
    if (!ride) {
      return {
        content:
          "No encuentro salidas en bicicleta en el periodo analizado. Sincroniza el reloj o cuéntame cómo te fue y lo anoto igual.",
        dataSources: [],
        suggestedActions: [],
      };
    }

    const km = ride.distanceMeters ? (ride.distanceMeters / 1000).toFixed(1) : undefined;
    const duration = this.formatMinutes(ride.durationSeconds ? Math.round(ride.durationSeconds / 60) : undefined);
    const zone4 = ride.hrZones?.find((z) => z.zone === 4)?.minutes;

    const content = [
      `${ride.name}: ${(ride.distanceMeters ?? 0) / 1000 >= 15 ? "una salida sólida" : "una salida corta"}${
        ride.elevationGainMeters ? `, con ${ride.elevationGainMeters} m de desnivel` : ""
      }.`,
      zone4
        ? `Pasaste ${zone4} min en zona 4, lo que explica el tiempo de recuperación que arrastras.`
        : "No tengo el desglose por zonas de esta actividad.",
      "Si repites este perfil, suma trabajo de agarre: es lo primero que se te agota en bajadas largas.",
    ].join(" ");

    const detail = [km ? `${km} km` : undefined, duration, ride.averageHr ? `${ride.averageHr} lpm media` : undefined]
      .filter((part): part is string => Boolean(part))
      .join(" · ");

    return {
      content,
      dataSources: [{ type: "garmin", label: ride.name, detail: detail || undefined }],
      suggestedActions: [],
    };
  }

  private trend(snapshot: GarminSnapshot): MockReply {
    const weeks = snapshot.weeklyTrends;
    if (weeks.length < 2) {
      return {
        content: "Todavía no tengo suficientes semanas sincronizadas para comparar tu evolución.",
        dataSources: [],
        suggestedActions: [],
      };
    }

    const first = weeks[0];
    const last = weeks[weeks.length - 1];
    const deltaDuration = (last.totalDurationMinutes ?? 0) - (first.totalDurationMinutes ?? 0);
    const deltaSleep = (last.avgSleepMinutes ?? 0) - (first.avgSleepMinutes ?? 0);

    const content = [
      deltaDuration >= 0 ? "Mantuviste el volumen en las últimas 4 semanas." : "Tu volumen bajó respecto de hace 4 semanas.",
      `El sueño promedio ${deltaSleep < 0 ? "cayó" : "subió"} y el HRV medio se movió de ${first.avgHrvMs ?? "sin dato"} a ${last.avgHrvMs ?? "sin dato"} ms.`,
      deltaSleep < -20
        ? "Antes de subir carga, recuperaría sueño: es la variable que más se movió en contra."
        : "Puedes sostener o subir levemente la carga la próxima semana.",
    ].join(" ");

    return {
      content,
      dataSources: [
        {
          type: "garmin",
          label: "Comparación de 4 semanas",
          detail: `${deltaDuration > 0 ? "+" : ""}${deltaDuration} min de volumen`,
        },
      ],
      suggestedActions: [],
    };
  }

  private adaptSession(snapshot: GarminSnapshot): MockReply {
    const score = snapshot.trainingReadiness?.score;
    let content: string;
    if (score === undefined) {
      content = "Sin Training Readiness de hoy no puedo ajustar la sesión con criterio — sincroniza el reloj y lo vemos.";
    } else if (score >= 75) {
      content = "Deja la sesión tal cual: tu readiness de hoy aguanta el plan completo sin ajustes.";
    } else if (score >= 50) {
      content =
        "Bajaría la intensidad alrededor de un 10% — mantén las series de fuerza y recorta el trabajo de potencia si te sientes pesado.";
    } else {
      content = "Cambiaría la sesión por movilidad: tu readiness de hoy no está para cargar fuerte.";
    }

    return {
      content,
      dataSources:
        score !== undefined ? [{ type: "garmin", label: "Tu estado de hoy", detail: `Training Readiness ${score}/100` }] : [],
      suggestedActions:
        score !== undefined
          ? [{ id: "action-adjust-session", label: "Ajustar próxima sesión", action: "adjust_next_session" }]
          : [],
    };
  }

  private progress(request: ChatRequest): MockReply {
    const logs = request.recentLogs;
    if (!logs.length) {
      return {
        content:
          "Todavía no tienes sesiones registradas, así que no puedo hablar de progresión. Registra tu próxima sesión con cargas y RPE y desde ahí comparamos.",
        dataSources: [],
        suggestedActions: [],
      };
    }

    const last = logs[logs.length - 1];
    const loads = last.exercises.filter((e) => e.load).map((e) => `${e.name}: ${e.load}`);

    const content = [
      `Tu última sesión registrada fue "${last.sessionTitle}".`,
      loads.length ? `Cargas registradas — ${loads.join(", ")}.` : "No registraste cargas en esa sesión.",
      loads.length
        ? "Si completaste todas las series al RPE previsto, subiría entre 2 y 4 kg en los básicos."
        : "Anota las cargas la próxima vez para poder ajustar la progresión.",
    ].join(" ");

    return {
      content,
      dataSources: [
        {
          type: "training_session",
          label: last.sessionTitle,
          detail: last.sessionRpe !== undefined ? `RPE ${last.sessionRpe}/10` : undefined,
        },
      ],
      suggestedActions: [],
    };
  }

  /**
   * Resume el historial combinado (Calendario): sesiones completadas, cuántas
   * quedaron vinculadas con datos reales de Garmin, y actividades libres.
   * A diferencia de `progress()` (que lee `SessionLog`, carga por ejercicio),
   * esto lee `request.trainingHistory` — la fuente que también consulta la
   * tool `get_training_history` del coach real.
   */
  private trainingHistorySummary(request: ChatRequest): MockReply {
    const history = request.trainingHistory;
    if (!history.length) {
      return {
        content:
          "Todavía no tengo sesiones ejecutadas para comparar con tu plan. Inicia una sesión desde Entrenamiento y vuelve a preguntarme.",
        dataSources: [],
        suggestedActions: [],
      };
    }

    const sessions = history.filter((entry) => entry.kind === "session");
    const completed = sessions.filter((entry) => entry.executionStatus === "completed");
    const linked = completed.filter((entry) => entry.matchStatus === "confirmed");

    const content = [
      `Completaste ${completed.length} de ${sessions.length} sesión${sessions.length === 1 ? "" : "es"} registrada${sessions.length === 1 ? "" : "s"}.`,
      linked.length
        ? `${linked.length} de ${completed.length} tienen actividad Garmin vinculada, así que puedo contrastar lo planificado con lo real.`
        : "Ninguna sesión completada tiene todavía una actividad Garmin vinculada.",
      completed.length < sessions.length
        ? "Te falta iniciar o finalizar algunas sesiones planificadas — hazlo desde Entrenamiento."
        : "Vas al día con tu plan. Sigue registrando para que pueda ajustar la carga con datos reales.",
    ].join(" ");

    return {
      content,
      dataSources: [{ type: "training_history", label: "Historial de entrenamiento" }],
      suggestedActions: [],
    };
  }

  /**
   * Responde ante una mención de dolor.
   *
   * Sólo escala cuando hay dolor realmente reportado: en un registro de sesión
   * con nivel alto, o en un mensaje que afirma dolor. Una negación como
   * "ninguna molestia" no debe interpretarse como que el usuario reportó dolor.
   */
  private painResponse(request: ChatRequest, text: string): string {
    if (DENIES_PAIN.test(text)) {
      return "Perfecto, lo anoto: sin molestias. Avísame si algo empieza a doler y ajustamos la sesión.";
    }

    const highestLoggedPain = Math.max(0, ...request.recentLogs.map((log) => log.painLevel ?? 0));
    if (needsPainEscalation({ pain: { level: highestLoggedPain } }) || ASSERTS_PAIN.test(text)) {
      return `${PAIN_ESCALATION_MESSAGE}\n\nMientras tanto puedo reemplazar el ejercicio que te molesta por una alternativa de menor carga articular, si me dices cuál es.`;
    }

    return "Cuéntame qué ejercicio te molesta y en qué momento del movimiento, y te propongo una alternativa del catálogo.";
  }

  /**
   * Turno de creación de plan.
   *
   * Pregunta sólo lo que falte, leyendo tanto el perfil guardado como lo que el
   * usuario ya respondió en la conversación. Cuando no falta nada, propone el
   * plan como datos estructurados, con una presentación conversacional corta
   * alrededor de la tarjeta.
   */
  private planTurn(request: ChatRequest, snapshot: GarminSnapshot): MockReply {
    const { profile, missing } = resolveAthleteProfile(request);

    if (missing.length) {
      return {
        content: `Para armarte un plan seguro necesito sólo esto:\n\n${missing
          .slice(0, 3)
          .map((question, index) => `${index + 1}. ${question}`)
          .join("\n")}`,
        dataSources: [],
        suggestedActions: [],
      };
    }

    const plan = buildDemoPlan();
    // El plan demo se adapta a lo que el usuario declaró, en vez de ignorarlo.
    const tailored = {
      ...plan,
      goal: profile.goals[0] ?? plan.goal,
      daysPerWeek: profile.daysPerWeek ?? plan.daysPerWeek,
      sessionDurationMinutes: profile.sessionDurationMinutes ?? plan.sessionDurationMinutes,
      sourceContext: {
        ...plan.sourceContext,
        garminPeriod: snapshot.period,
        userGoals: profile.goals,
        limitations: profile.limitations,
        equipment: profile.equipment.length ? profile.equipment : plan.sourceContext.equipment,
      },
    };

    return {
      content:
        "Te armé un plan funcional de MTB, pensado para bajar con más control y aguantar sesiones largas. Revísalo abajo y guárdalo cuando quieras empezar.",
      planProposal: {
        plan: tailored,
        summary: `${tailored.durationWeeks} semanas · ${tailored.daysPerWeek} días por semana · sesiones de ${tailored.sessionDurationMinutes} min.`,
      },
      dataSources: [],
      suggestedActions: [],
    };
  }
}
