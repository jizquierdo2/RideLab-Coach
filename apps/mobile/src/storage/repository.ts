import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  activitySessionMatchSchema,
  garminActivitySchema,
  performanceResponseSchema,
  plannedSessionOccurrenceSchema,
  sessionExecutionSchema,
  sessionLogSchema,
  trainingPlanSchema,
  athleteProfileSchema,
  validateTrainingPlan,
  wellnessNoteSchema,
  type ActivitySessionMatch,
  type AthleteProfile,
  type GarminActivity,
  type PerformanceResponse,
  type PlannedSessionOccurrence,
  type SessionExecution,
  type SessionLog,
  type SessionStatus,
  type TrainingPlan,
  type WellnessNote,
} from "@ridelab/shared";

/**
 * Persistencia local sobre AsyncStorage.
 *
 * Todo lo que entra vuelve a validarse con Zod al leerse: un dato corrupto en
 * disco no debe tumbar la app ni colarse como plan válido.
 */

const KEYS = {
  plans: "ridelab:plans",
  activePlanId: "ridelab:activePlanId",
  sessionStatus: "ridelab:sessionStatus",
  logs: "ridelab:logs",
  profile: "ridelab:profile",
  executions: "ridelab:executions",
  activities: "ridelab:activities",
  matches: "ridelab:matches",
  calendarDemoSeeded: "ridelab:calendarDemoSeeded",
  performance: "ridelab:performance",
  occurrences: "ridelab:occurrences",
  wellnessNotes: "ridelab:wellnessNotes",
} as const;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

/**
 * Id con sufijo aleatorio, no sólo `Date.now()`: dos llamadas sincrónicas
 * dentro del mismo milisegundo (p. ej. `finish()` seguido de `repeatNow()`)
 * generarían el mismo id y una pisaría a la otra.
 */
function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Repositorio de planes de entrenamiento. */
export const planRepository = {
  async list(): Promise<TrainingPlan[]> {
    const raw = await readJson<unknown[]>(KEYS.plans, []);
    // Se descartan silenciosamente los planes que ya no cumplen el schema.
    return raw
      .map((item) => trainingPlanSchema.safeParse(item))
      .filter((result): result is { success: true; data: TrainingPlan } => result.success)
      .map((result) => result.data);
  },

  /**
   * Guarda un plan. Rechaza cualquier objeto que no pase la validación completa,
   * de modo que nunca se persista un plan inválido.
   */
  async save(candidate: unknown): Promise<TrainingPlan> {
    const result = validateTrainingPlan(candidate);
    if (!result.ok) {
      throw new Error(`Plan inválido, no se guardó: ${result.errors.join("; ")}`);
    }

    const plans = await planRepository.list();
    const next = [...plans.filter((p) => p.id !== result.plan.id), result.plan];
    await writeJson(KEYS.plans, next);
    return result.plan;
  },

  async get(id: string): Promise<TrainingPlan | undefined> {
    return (await planRepository.list()).find((plan) => plan.id === id);
  },

  async remove(id: string): Promise<void> {
    const plans = await planRepository.list();
    await writeJson(
      KEYS.plans,
      plans.filter((plan) => plan.id !== id),
    );
  },

  async getActiveId(): Promise<string | undefined> {
    return (await AsyncStorage.getItem(KEYS.activePlanId)) ?? undefined;
  },

  async setActiveId(id: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.activePlanId, id);
  },

  async getActive(): Promise<TrainingPlan | undefined> {
    const id = await planRepository.getActiveId();
    return id ? planRepository.get(id) : undefined;
  },
};

/** Estado de cada sesión: pendiente, completada u omitida. */
export const sessionStatusRepository = {
  async all(): Promise<Record<string, SessionStatus>> {
    return readJson<Record<string, SessionStatus>>(KEYS.sessionStatus, {});
  },

  async set(sessionId: string, status: SessionStatus): Promise<Record<string, SessionStatus>> {
    const current = await sessionStatusRepository.all();
    const next = { ...current, [sessionId]: status };
    await writeJson(KEYS.sessionStatus, next);
    return next;
  },
};

/** Registro de sesiones realizadas. Es la memoria que consulta el agente. */
export const sessionLogRepository = {
  async list(): Promise<SessionLog[]> {
    const raw = await readJson<unknown[]>(KEYS.logs, []);
    return raw
      .map((item) => sessionLogSchema.safeParse(item))
      .filter((result): result is { success: true; data: SessionLog } => result.success)
      .map((result) => result.data);
  },

  async save(candidate: unknown): Promise<SessionLog> {
    const parsed = sessionLogSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new Error(
        `Registro inválido, no se guardó: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      );
    }

    const logs = await sessionLogRepository.list();
    await writeJson(KEYS.logs, [...logs.filter((log) => log.id !== parsed.data.id), parsed.data]);
    return parsed.data;
  },

  async forSession(sessionId: string): Promise<SessionLog | undefined> {
    return (await sessionLogRepository.list()).find((log) => log.sessionId === sessionId);
  },
};

/** Perfil del atleta, para que el coach no repita preguntas ya contestadas. */
export const profileRepository = {
  async get(): Promise<AthleteProfile | undefined> {
    const raw = await readJson<unknown>(KEYS.profile, undefined);
    if (!raw) return undefined;
    const parsed = athleteProfileSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  },

  async save(profile: AthleteProfile): Promise<AthleteProfile> {
    const parsed = athleteProfileSchema.parse(profile);
    await writeJson(KEYS.profile, parsed);
    return parsed;
  },

  async merge(patch: Partial<AthleteProfile>): Promise<AthleteProfile> {
    const current = (await profileRepository.get()) ?? athleteProfileSchema.parse({});
    return profileRepository.save({ ...current, ...patch });
  },
};

/**
 * Ejecuciones reales de una sesión planificada (inicio/fin/estado), separadas
 * del detalle por ejercicio que guarda `sessionLogRepository`. Es la señal que
 * consume el motor de matching contra Garmin.
 */
export const sessionExecutionRepository = {
  async list(): Promise<SessionExecution[]> {
    const raw = await readJson<unknown[]>(KEYS.executions, []);
    return raw
      .map((item) => sessionExecutionSchema.safeParse(item))
      .filter((result): result is { success: true; data: SessionExecution } => result.success)
      .map((result) => result.data);
  },

  async save(candidate: SessionExecution): Promise<SessionExecution> {
    const parsed = sessionExecutionSchema.parse(candidate);
    const executions = await sessionExecutionRepository.list();
    await writeJson(
      KEYS.executions,
      [...executions.filter((execution) => execution.id !== parsed.id), parsed],
    );
    return parsed;
  },

  /** La ejecución más reciente para esa sesión planificada, si existe. */
  async forPlannedSession(plannedSessionId: string): Promise<SessionExecution | undefined> {
    const executions = (await sessionExecutionRepository.list())
      .filter((execution) => execution.plannedSessionId === plannedSessionId)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    return executions[executions.length - 1];
  },

  async start(plannedSessionId: string): Promise<SessionExecution> {
    return sessionExecutionRepository.save({
      id: uniqueId(`exec_${plannedSessionId}`),
      plannedSessionId,
      startedAt: new Date().toISOString(),
      status: "started",
    });
  },

  /**
   * Finaliza la ejecución en curso de esa sesión. Si el usuario nunca tocó
   * "Iniciar sesión" (reinstaló, cerró la app a medio camino), se crea una
   * ejecución sintética iniciada y terminada ahora mismo, en vez de fallar.
   */
  async finish(
    plannedSessionId: string,
    patch: { actualRpe?: number; painLevel?: number; notes?: string },
  ): Promise<SessionExecution> {
    const existing = await sessionExecutionRepository.forPlannedSession(plannedSessionId);
    const now = new Date().toISOString();
    const base: SessionExecution =
      existing?.status === "started"
        ? existing
        : { id: uniqueId(`exec_${plannedSessionId}`), plannedSessionId, startedAt: now, status: "started" };

    return sessionExecutionRepository.save({
      ...base,
      finishedAt: now,
      status: "completed",
      ...patch,
    });
  },

  /**
   * Repite una sesión ya completada, ahora mismo. Crea occurrence + execution
   * nuevas con `origin: "repeated"` — nunca toca la ejecución original (ni su
   * fecha, RPE ni vínculo con Garmin).
   */
  async repeatNow(templateId: string, sourceExecutionId: string): Promise<SessionExecution> {
    const occurrence = await plannedSessionOccurrenceRepository.save({
      id: uniqueId(`occ_${templateId}`),
      templateId,
      origin: "repeated",
      status: "started",
      sourceOccurrenceId: sourceExecutionId,
    });

    return sessionExecutionRepository.save({
      id: uniqueId(`exec_${templateId}`),
      plannedSessionId: templateId,
      startedAt: new Date().toISOString(),
      status: "started",
      occurrenceId: occurrence.id,
      sourceExecutionId,
    });
  },

  /** Programa una repetición para otro día, sin iniciar nada todavía. */
  async repeatSchedule(
    templateId: string,
    sourceExecutionId: string,
    scheduledDate: string,
  ): Promise<PlannedSessionOccurrence> {
    return plannedSessionOccurrenceRepository.save({
      id: uniqueId(`occ_${templateId}`),
      templateId,
      scheduledDate,
      origin: "repeated",
      status: "planned",
      sourceOccurrenceId: sourceExecutionId,
    });
  },
};

/**
 * Ocurrencias de sesiones planificadas. Las del plan original nunca generan
 * una fila acá (su propio id de plan ya es su identidad implícita) — sólo
 * existen para repeticiones (`origin: "repeated"`).
 */
export const plannedSessionOccurrenceRepository = {
  async list(): Promise<PlannedSessionOccurrence[]> {
    const raw = await readJson<unknown[]>(KEYS.occurrences, []);
    return raw
      .map((item) => plannedSessionOccurrenceSchema.safeParse(item))
      .filter((result): result is { success: true; data: PlannedSessionOccurrence } => result.success)
      .map((result) => result.data);
  },

  async save(candidate: PlannedSessionOccurrence): Promise<PlannedSessionOccurrence> {
    const parsed = plannedSessionOccurrenceSchema.parse(candidate);
    const occurrences = await plannedSessionOccurrenceRepository.list();
    await writeJson(
      KEYS.occurrences,
      [...occurrences.filter((occurrence) => occurrence.id !== parsed.id), parsed],
    );
    return parsed;
  },

  async forTemplate(templateId: string): Promise<PlannedSessionOccurrence[]> {
    return (await plannedSessionOccurrenceRepository.list()).filter(
      (occurrence) => occurrence.templateId === templateId,
    );
  },
};

/** Actividades sincronizadas desde Garmin. `id` es el id de Garmin: importar dos veces no duplica. */
export const garminActivityRepository = {
  async list(): Promise<GarminActivity[]> {
    const raw = await readJson<unknown[]>(KEYS.activities, []);
    return raw
      .map((item) => garminActivitySchema.safeParse(item))
      .filter((result): result is { success: true; data: GarminActivity } => result.success)
      .map((result) => result.data);
  },

  async save(candidate: GarminActivity): Promise<GarminActivity> {
    const parsed = garminActivitySchema.parse(candidate);
    const activities = await garminActivityRepository.list();
    await writeJson(
      KEYS.activities,
      [...activities.filter((activity) => activity.id !== parsed.id), parsed],
    );
    return parsed;
  },

  async forDateRange(startDate: string, endDate: string): Promise<GarminActivity[]> {
    const activities = await garminActivityRepository.list();
    return activities.filter((activity) => {
      const day = activity.startedAt.slice(0, 10);
      return day >= startDate && day <= endDate;
    });
  },
};

/**
 * Vínculo entre una ejecución y una actividad Garmin.
 *
 * `confirm` aplica las dos invariantes del producto antes de escribir: una
 * actividad no puede quedar confirmada en dos sesiones, y una sesión no puede
 * tener dos actividades confirmadas (MVP).
 */
export const activitySessionMatchRepository = {
  async list(): Promise<ActivitySessionMatch[]> {
    const raw = await readJson<unknown[]>(KEYS.matches, []);
    return raw
      .map((item) => activitySessionMatchSchema.safeParse(item))
      .filter((result): result is { success: true; data: ActivitySessionMatch } => result.success)
      .map((result) => result.data);
  },

  async save(candidate: ActivitySessionMatch): Promise<ActivitySessionMatch> {
    const parsed = activitySessionMatchSchema.parse(candidate);
    const matches = await activitySessionMatchRepository.list();
    await writeJson(KEYS.matches, [...matches.filter((match) => match.id !== parsed.id), parsed]);
    return parsed;
  },

  async forExecution(sessionExecutionId: string): Promise<ActivitySessionMatch[]> {
    return (await activitySessionMatchRepository.list()).filter(
      (match) => match.sessionExecutionId === sessionExecutionId,
    );
  },

  async forActivity(garminActivityId: string): Promise<ActivitySessionMatch[]> {
    return (await activitySessionMatchRepository.list()).filter(
      (match) => match.garminActivityId === garminActivityId,
    );
  },

  /** Pares `${sessionExecutionId}::${garminActivityId}` ya rechazados, para que el matcher no los repita. */
  async rejectedPairKeys(): Promise<Set<string>> {
    const matches = await activitySessionMatchRepository.list();
    return new Set(
      matches
        .filter((match) => match.status === "rejected")
        .map((match) => `${match.sessionExecutionId}::${match.garminActivityId}`),
    );
  },

  async confirm(
    sessionExecutionId: string,
    garminActivityId: string,
    opts: { method: "automatic" | "manual"; confidence: number },
  ): Promise<ActivitySessionMatch> {
    const matches = await activitySessionMatchRepository.list();

    const activityConflict = matches.find(
      (match) =>
        match.garminActivityId === garminActivityId &&
        match.status === "confirmed" &&
        match.sessionExecutionId !== sessionExecutionId,
    );
    if (activityConflict) {
      throw new Error("Esta actividad Garmin ya está vinculada a otra sesión.");
    }

    const executionConflict = matches.find(
      (match) =>
        match.sessionExecutionId === sessionExecutionId &&
        match.status === "confirmed" &&
        match.garminActivityId !== garminActivityId,
    );
    if (executionConflict) {
      throw new Error("Esta sesión ya tiene una actividad Garmin confirmada.");
    }

    const existing = matches.find(
      (match) => match.sessionExecutionId === sessionExecutionId && match.garminActivityId === garminActivityId,
    );

    return activitySessionMatchRepository.save({
      id: existing?.id ?? `match_${sessionExecutionId}_${garminActivityId}`,
      sessionExecutionId,
      garminActivityId,
      status: "confirmed",
      method: opts.method,
      confidence: opts.confidence,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
    });
  },

  async reject(sessionExecutionId: string, garminActivityId: string): Promise<ActivitySessionMatch> {
    const matches = await activitySessionMatchRepository.list();
    const existing = matches.find(
      (match) => match.sessionExecutionId === sessionExecutionId && match.garminActivityId === garminActivityId,
    );

    return activitySessionMatchRepository.save({
      id: existing?.id ?? `match_${sessionExecutionId}_${garminActivityId}`,
      sessionExecutionId,
      garminActivityId,
      status: "rejected",
      method: existing?.method ?? "manual",
      confidence: existing?.confidence ?? 0,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
  },

  /** Elimina un match confirmado, dejando la sesión y la actividad libres de nuevo. */
  async unlink(sessionExecutionId: string, garminActivityId: string): Promise<void> {
    const matches = await activitySessionMatchRepository.list();
    await writeJson(
      KEYS.matches,
      matches.filter(
        (match) => !(match.sessionExecutionId === sessionExecutionId && match.garminActivityId === garminActivityId),
      ),
    );
  },
};

/** Marca de una sola vía: el escenario demo de Calendario sólo se siembra una vez. */
export const calendarDemoSeedRepository = {
  async isSeeded(): Promise<boolean> {
    return (await AsyncStorage.getItem(KEYS.calendarDemoSeeded)) === "true";
  },
  async markSeeded(): Promise<void> {
    await AsyncStorage.setItem(KEYS.calendarDemoSeeded, "true");
  },
};

export interface StoredPerformance {
  response: PerformanceResponse;
  updatedAt: string;
}

/**
 * Último snapshot/assessment/guidance válidos de Estado. Nunca se borra ante
 * un error de "Actualizar" — sólo se reemplaza cuando llega uno nuevo válido.
 */
export const performanceRepository = {
  async get(): Promise<StoredPerformance | undefined> {
    const raw = await readJson<unknown>(KEYS.performance, undefined);
    if (!raw || typeof raw !== "object") return undefined;
    const candidate = raw as { response?: unknown; updatedAt?: unknown };
    const parsed = performanceResponseSchema.safeParse(candidate.response);
    if (!parsed.success || typeof candidate.updatedAt !== "string") return undefined;
    return { response: parsed.data, updatedAt: candidate.updatedAt };
  },

  async save(response: PerformanceResponse): Promise<StoredPerformance> {
    const parsed = performanceResponseSchema.parse(response);
    const stored: StoredPerformance = { response: parsed, updatedAt: new Date().toISOString() };
    await writeJson(KEYS.performance, stored);
    return stored;
  },
};

/**
 * Notas subjetivas ("cómo me siento"). Una por día: guardar de nuevo para el
 * mismo día reemplaza la nota anterior en vez de acumular duplicados.
 */
export const wellnessNoteRepository = {
  async list(): Promise<WellnessNote[]> {
    const raw = await readJson<unknown[]>(KEYS.wellnessNotes, []);
    return raw
      .map((item) => wellnessNoteSchema.safeParse(item))
      .filter((result): result is { success: true; data: WellnessNote } => result.success)
      .map((result) => result.data)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  async forDate(date: string): Promise<WellnessNote | undefined> {
    const notes = await wellnessNoteRepository.list();
    return notes.find((note) => note.date === date);
  },

  async save(date: string, note: string): Promise<WellnessNote> {
    const notes = await wellnessNoteRepository.list();
    const saved: WellnessNote = {
      id: notes.find((item) => item.date === date)?.id ?? uniqueId(`note_${date}`),
      date,
      note,
      createdAt: new Date().toISOString(),
    };
    await writeJson(KEYS.wellnessNotes, [...notes.filter((item) => item.date !== date), saved]);
    return saved;
  },
};

/** Sólo para pruebas y para el botón de reinicio. */
export async function clearAllData(): Promise<void> {
  await AsyncStorage.multiRemove(Object.values(KEYS));
}
