import {
  buildDemoPlan,
  fallbackGuidance,
  needsPainEscalation,
  PAIN_ESCALATION_MESSAGE,
  type ChatMessage,
  type ChatRequest,
  type CoachAnalysis,
  type GarminSnapshot,
  type MetricChip,
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

/**
 * Coach simulado que impulsa el modo demo.
 *
 * No inventa métricas: todo lo que reporta sale del snapshot que recibe, y si un
 * dato no está, lo dice. Reconoce las intenciones de las sugerencias rápidas y
 * cubre el flujo completo de creación de plan, incluidas las preguntas mínimas.
 */
export class MockAgentGateway implements AgentGateway {
  readonly name = "MockAgentGateway";

  async reply(request: ChatRequest, snapshot: GarminSnapshot): Promise<ChatMessage> {
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
      return { ...base, content: "", analysis: this.trainingHistorySummary(request) };
    }
    // Si el turno anterior fueron las preguntas del plan, este mensaje es la
    // respuesta a esas preguntas: sigue en el flujo del plan aunque mencione
    // palabras que en otro contexto activarían otra intención.
    if (this.isAnsweringPlanQuestions(request) || this.matches(text, PLAN_KEYWORDS)) {
      return { ...base, ...this.planTurn(request, snapshot) };
    }
    if (this.matches(text, ["última salida", "ultima salida", "bicicleta", "analiza", "salida"])) {
      return { ...base, content: "", analysis: this.lastRide(snapshot) };
    }
    if (this.matches(text, ["compárame", "comparame", "cuatro semanas", "4 semanas", "tendencia"])) {
      return { ...base, content: "", analysis: this.trend(snapshot) };
    }
    if (this.matches(text, ["adapta", "ajusta", "modifica"])) {
      return { ...base, content: "", analysis: this.adaptSession(snapshot) };
    }
    if (this.matches(text, ["progres", "peso ocupé", "peso ocupe", "última vez", "ultima vez"])) {
      return { ...base, content: "", analysis: this.progress(request) };
    }
    if (this.matches(text, ["dolor", "molestia", "lesión", "lesion", "duele"])) {
      return { ...base, content: this.painResponse(request, text) };
    }

    // Por defecto: recuperación de hoy, que es la pregunta central del producto.
    return { ...base, content: "", analysis: this.recovery(snapshot) };
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

  /** Cabecera común: periodo, sincronización, fuente y métricas ausentes. */
  private provenance(snapshot: GarminSnapshot) {
    return {
      period: snapshot.period,
      lastSyncAt: snapshot.lastSyncAt,
      dataSource: snapshot.dataSource,
      unavailableMetrics: snapshot.unavailableMetrics,
    };
  }

  private formatMinutes(minutes: number | undefined): string | undefined {
    if (minutes === undefined) return undefined;
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
  }

  private recovery(snapshot: GarminSnapshot): CoachAnalysis {
    const metrics: MetricChip[] = [];
    const missing: string[] = [];

    const sleepText = this.formatMinutes(snapshot.sleep?.durationMinutes);
    if (sleepText) {
      metrics.push({
        label: "Sueño",
        value: sleepText,
        tone: (snapshot.sleep?.vsAverageMinutes ?? 0) < -30 ? "warning" : "good",
      });
    } else {
      missing.push("Duración de sueño");
    }

    if (snapshot.hrv?.vsBaselinePercent !== undefined) {
      const delta = snapshot.hrv.vsBaselinePercent;
      metrics.push({
        label: "HRV",
        value: `${delta > 0 ? "+" : ""}${delta}% vs base`,
        tone: delta < -5 ? "warning" : "good",
      });
    } else {
      missing.push("HRV");
    }

    if (snapshot.bodyBattery?.current !== undefined) {
      metrics.push({
        label: "Body Battery",
        value: String(snapshot.bodyBattery.current),
        tone: snapshot.bodyBattery.current < 50 ? "warning" : "good",
      });
    } else {
      missing.push("Body Battery");
    }

    if (snapshot.trainingReadiness?.recoveryTimeHours !== undefined) {
      metrics.push({
        label: "Recuperación",
        value: `${snapshot.trainingReadiness.recoveryTimeHours} h`,
        tone: "neutral",
      });
    }

    if (snapshot.restingHeartRate !== undefined) {
      metrics.push({ label: "FC reposo", value: `${snapshot.restingHeartRate} lpm`, tone: "neutral" });
    }

    const score = snapshot.trainingReadiness?.score;
    const headline =
      score === undefined
        ? "No tengo Training Readiness para hoy, así que no puedo darte un veredicto de recuperación."
        : score >= 75
          ? "Hoy tienes buena recuperación."
          : score >= 50
            ? "Hoy tienes una recuperación moderada."
            : "Hoy tu recuperación está baja.";

    return {
      headline,
      metrics,
      interpretation:
        score === undefined
          ? undefined
          : `Dormiste ${snapshot.sleep?.vsAverageMinutes !== undefined && snapshot.sleep.vsAverageMinutes < 0 ? "menos que tu promedio" : "en línea con tu promedio"} y tu HRV está ${
              (snapshot.hrv?.vsBaselinePercent ?? 0) < 0 ? "por debajo de" : "dentro de"
            } tu línea base.`,
      recommendation:
        score === undefined
          ? "Registra una noche completa con el reloj puesto para que pueda evaluarte."
          : score >= 75
            ? "Puedes ir por la sesión completa según lo planificado."
            : score >= 50
              ? "Mantén la sesión, pero baja alrededor de un 10% la intensidad."
              : "Prioriza movilidad o descanso y deja la carga fuerte para mañana.",
      ...this.provenance(snapshot),
      unavailableMetrics: [...snapshot.unavailableMetrics, ...missing],
    };
  }

  private lastRide(snapshot: GarminSnapshot): CoachAnalysis {
    const ride = snapshot.recentActivities.find((a) => a.type.includes("bik") || a.type.includes("cycl"));
    if (!ride) {
      return {
        headline: "No encuentro salidas en bicicleta en el periodo analizado.",
        metrics: [],
        recommendation: "Sincroniza el reloj o amplía el rango de fechas.",
        ...this.provenance(snapshot),
      };
    }

    const metrics: MetricChip[] = [];
    if (ride.distanceMeters) {
      metrics.push({ label: "Distancia", value: `${(ride.distanceMeters / 1000).toFixed(1)} km`, tone: "neutral" });
    }
    if (ride.durationSeconds) {
      metrics.push({
        label: "Duración",
        value: this.formatMinutes(Math.round(ride.durationSeconds / 60)) ?? "-",
        tone: "neutral",
      });
    }
    if (ride.elevationGainMeters !== undefined) {
      metrics.push({ label: "Desnivel", value: `${ride.elevationGainMeters} m`, tone: "neutral" });
    }
    if (ride.averageHr) metrics.push({ label: "FC media", value: `${ride.averageHr} lpm`, tone: "neutral" });
    if (ride.normalizedPowerWatts) {
      metrics.push({ label: "Potencia norm.", value: `${ride.normalizedPowerWatts} W`, tone: "neutral" });
    }

    const zone4 = ride.hrZones?.find((z) => z.zone === 4)?.minutes;

    return {
      headline: `${ride.name}: ${(ride.distanceMeters ?? 0) / 1000 >= 15 ? "salida sólida" : "salida corta"} con ${ride.elevationGainMeters ?? 0} m de desnivel.`,
      metrics,
      interpretation: zone4
        ? `Pasaste ${zone4} min en zona 4, lo que explica el tiempo de recuperación que arrastras.`
        : "No tengo el desglose por zonas de esta actividad.",
      recommendation: "Si repites este perfil, suma trabajo de agarre: es lo primero que se te agota en bajadas largas.",
      ...this.provenance(snapshot),
    };
  }

  private trend(snapshot: GarminSnapshot): CoachAnalysis {
    const weeks = snapshot.weeklyTrends;
    if (weeks.length < 2) {
      return {
        headline: "No tengo suficientes semanas para comparar.",
        metrics: [],
        ...this.provenance(snapshot),
      };
    }

    const first = weeks[0];
    const last = weeks[weeks.length - 1];
    const deltaDuration = (last.totalDurationMinutes ?? 0) - (first.totalDurationMinutes ?? 0);
    const deltaSleep = (last.avgSleepMinutes ?? 0) - (first.avgSleepMinutes ?? 0);

    return {
      headline:
        deltaDuration >= 0
          ? "Mantuviste el volumen en las últimas 4 semanas."
          : "Tu volumen bajó respecto de hace 4 semanas.",
      metrics: [
        { label: "Volumen", value: `${deltaDuration > 0 ? "+" : ""}${deltaDuration} min`, tone: deltaDuration >= 0 ? "good" : "warning" },
        { label: "Sueño medio", value: `${deltaSleep > 0 ? "+" : ""}${deltaSleep} min`, tone: deltaSleep >= 0 ? "good" : "warning" },
        { label: "HRV medio", value: `${last.avgHrvMs ?? "-"} ms`, tone: "neutral" },
      ],
      interpretation: `El sueño promedio ${deltaSleep < 0 ? "cayó" : "subió"} y el HRV medio se movió de ${first.avgHrvMs ?? "-"} a ${last.avgHrvMs ?? "-"} ms.`,
      recommendation:
        deltaSleep < -20
          ? "Antes de subir carga, recupera sueño: es la variable que más se movió en contra."
          : "Puedes sostener o subir levemente la carga la próxima semana.",
      ...this.provenance(snapshot),
    };
  }

  private adaptSession(snapshot: GarminSnapshot): CoachAnalysis {
    const score = snapshot.trainingReadiness?.score;
    return {
      headline:
        score === undefined
          ? "Sin Training Readiness no puedo ajustar la sesión con criterio."
          : score >= 75
            ? "Deja la sesión tal cual."
            : score >= 50
              ? "Baja la intensidad alrededor de un 10%."
              : "Cambia la sesión por movilidad.",
      metrics: score !== undefined ? [{ label: "Readiness", value: String(score), tone: score >= 75 ? "good" : "warning" }] : [],
      interpretation:
        score === undefined ? undefined : "El ajuste se apoya en readiness, sueño de anoche y tiempo de recuperación pendiente.",
      recommendation:
        score === undefined
          ? "Sincroniza el reloj para que pueda proponerte un ajuste."
          : "Mantén las series de fuerza y recorta el trabajo de potencia si te sientes pesado.",
      ...this.provenance(snapshot),
    };
  }

  private progress(request: ChatRequest): CoachAnalysis {
    const logs = request.recentLogs;
    if (!logs.length) {
      return {
        headline: "Todavía no tienes sesiones registradas, así que no puedo hablar de progresión.",
        metrics: [],
        recommendation: "Registra tu próxima sesión con cargas y RPE y desde ahí puedo comparar.",
        unavailableMetrics: ["Historial de sesiones"],
      };
    }

    const last = logs[logs.length - 1];
    const first = logs[0];
    const loads = last.exercises.filter((e) => e.load).map((e) => `${e.name}: ${e.load}`);

    // Esta respuesta no sale de Garmin sino del registro propio: se declara así
    // en vez de dejar el periodo vacío.
    const day = (iso: string) => iso.slice(0, 10);
    const period =
      logs.length === 1
        ? `Registro de entrenamiento: 1 sesión (${day(last.completedAt)})`
        : `Registro de entrenamiento: ${logs.length} sesiones (${day(first.completedAt)} a ${day(last.completedAt)})`;

    return {
      headline: `Tu última sesión registrada fue "${last.sessionTitle}".`,
      period,
      lastSyncAt: last.completedAt,
      metrics: [
        { label: "Sesiones", value: String(logs.length), tone: "neutral" },
        ...(last.sessionRpe ? [{ label: "RPE", value: String(last.sessionRpe), tone: "neutral" as const }] : []),
      ],
      interpretation: loads.length ? `Cargas registradas — ${loads.join(" · ")}.` : "No registraste cargas en esa sesión.",
      recommendation: loads.length
        ? "Si completaste todas las series al RPE previsto, sube entre 2 y 4 kg en los básicos."
        : "Anota las cargas la próxima vez para poder ajustar la progresión.",
      unavailableMetrics: [],
    };
  }

  /**
   * Resume el historial combinado (Calendario): sesiones completadas, cuántas
   * quedaron vinculadas con datos reales de Garmin, y actividades libres.
   * A diferencia de `progress()` (que lee `SessionLog`, carga por ejercicio),
   * esto lee `request.trainingHistory` — la fuente que también consulta la
   * tool `get_training_history` del coach real.
   */
  private trainingHistorySummary(request: ChatRequest): CoachAnalysis {
    const history = request.trainingHistory;
    if (!history.length) {
      return {
        headline: "Todavía no tengo sesiones ejecutadas para comparar con tu plan.",
        metrics: [],
        recommendation: "Inicia una sesión desde Entrenamiento y vuelve a preguntarme.",
        unavailableMetrics: ["Historial combinado"],
      };
    }

    const sessions = history.filter((entry) => entry.kind === "session");
    const completed = sessions.filter((entry) => entry.executionStatus === "completed");
    const linked = completed.filter((entry) => entry.matchStatus === "confirmed");
    const freeActivities = history.filter((entry) => entry.kind === "freeActivity");

    return {
      headline: `Completaste ${completed.length} de ${sessions.length} sesión${sessions.length === 1 ? "" : "es"} registrada${sessions.length === 1 ? "" : "s"}.`,
      metrics: [
        { label: "Completadas", value: `${completed.length}/${sessions.length}`, tone: "neutral" },
        { label: "Con datos Garmin", value: String(linked.length), tone: linked.length ? "good" : "neutral" },
        ...(freeActivities.length ? [{ label: "Actividades libres", value: String(freeActivities.length), tone: "neutral" as const }] : []),
      ],
      interpretation: linked.length
        ? `${linked.length} de ${completed.length} sesiones completadas tienen actividad Garmin vinculada, así que puedo contrastar lo planificado con lo real.`
        : "Ninguna sesión completada tiene todavía una actividad Garmin vinculada.",
      recommendation:
        completed.length < sessions.length
          ? "Te falta iniciar o finalizar algunas sesiones planificadas — hazlo desde Entrenamiento."
          : "Vas al día con tu plan. Sigue registrando para que pueda ajustar la carga con datos reales.",
      unavailableMetrics: [],
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
   * plan como datos estructurados.
   */
  private planTurn(
    request: ChatRequest,
    snapshot: GarminSnapshot,
  ): Pick<ChatMessage, "content" | "planProposal" | "analysis"> {
    const { profile, missing } = resolveAthleteProfile(request);

    if (missing.length) {
      return {
        content: `Para armarte un plan seguro necesito sólo esto:\n\n${missing
          .slice(0, 3)
          .map((question, index) => `${index + 1}. ${question}`)
          .join("\n")}`,
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

    const nextSession = tailored.weeks[0]?.sessions[0];

    return {
      content: "",
      planProposal: {
        plan: tailored,
        summary: `${tailored.durationWeeks} semanas · ${tailored.daysPerWeek} días por semana · sesiones de ${tailored.sessionDurationMinutes} min. Próxima: ${nextSession?.title ?? "-"}.`,
      },
      analysis: {
        headline: "Te armé un plan funcional de MTB.",
        metrics: [],
        interpretation: `Lo construí considerando ${snapshot.period} y lo que me contaste sobre tu disponibilidad y equipamiento.`,
        recommendation: "Revísalo y guárdalo en Entrenamiento para poder registrar tus sesiones.",
        ...this.provenance(snapshot),
      },
    };
  }
}
