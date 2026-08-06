import {
  formatSantiagoDayLabel,
  santiagoDayKey,
  toPlannedSession,
  type ActivitySessionMatch,
  type ChatTrainingHistoryEntry,
  type CombinedTrainingRecord,
  type GarminActivity,
  type PlannedSession,
  type SessionExecution,
  type TrainingPlan,
} from "@ridelab/shared";

/** Busca la sesión planificada (proyección) entre todos los planes guardados, no sólo el activo. */
export function findPlannedSession(plans: TrainingPlan[], plannedSessionId: string): PlannedSession | undefined {
  for (const plan of plans) {
    for (const week of plan.weeks) {
      const session = week.sessions.find((item) => item.id === plannedSessionId);
      if (session) return toPlannedSession(plan, session);
    }
  }
  return undefined;
}

/** Une ejecuciones, actividades y matches en la vista combinada que consume el calendario. */
export function buildCombinedRecords(
  plans: TrainingPlan[],
  executions: SessionExecution[],
  activities: GarminActivity[],
  matches: ActivitySessionMatch[],
): CombinedTrainingRecord[] {
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));

  const records: CombinedTrainingRecord[] = [];

  for (const execution of executions) {
    const plannedSession = findPlannedSession(plans, execution.plannedSessionId);
    if (!plannedSession) continue;

    const match = matches.find(
      (candidate) => candidate.sessionExecutionId === execution.id && candidate.status !== "rejected",
    );
    const garminActivity = match ? activityById.get(match.garminActivityId) : undefined;

    const record: CombinedTrainingRecord = { plannedSession, execution };
    if (garminActivity) record.garminActivity = garminActivity;
    if (match) record.match = match;
    records.push(record);
  }

  return records;
}

/** Actividades Garmin que no están vinculadas (ni sugeridas ni confirmadas) a ninguna ejecución. */
export function freeActivities(
  activities: GarminActivity[],
  matches: ActivitySessionMatch[],
): GarminActivity[] {
  const linkedIds = new Set(matches.filter((match) => match.status !== "rejected").map((match) => match.garminActivityId));
  return activities.filter((activity) => !linkedIds.has(activity.id));
}

export interface DayIndicators {
  hasPlanned: boolean;
  hasGarmin: boolean;
  isLinked: boolean;
}

/** Indicadores por día (clave `YYYY-MM-DD` en hora de Santiago) para la cuadrícula mensual. */
export function buildDayIndicators(
  records: CombinedTrainingRecord[],
  unlinkedActivities: GarminActivity[],
): Map<string, DayIndicators> {
  const byDay = new Map<string, DayIndicators>();

  const touch = (day: string, patch: Partial<DayIndicators>) => {
    const current = byDay.get(day) ?? { hasPlanned: false, hasGarmin: false, isLinked: false };
    byDay.set(day, { ...current, ...patch });
  };

  for (const record of records) {
    const day = santiagoDayKey(record.execution.startedAt);
    touch(day, { hasPlanned: true });
    if (record.garminActivity && record.match?.status === "confirmed") {
      touch(day, { hasGarmin: true, isLinked: true });
    }
  }

  for (const activity of unlinkedActivities) {
    const day = santiagoDayKey(activity.startedAt);
    touch(day, { hasGarmin: true });
  }

  return byDay;
}

/** Cuadrícula de semanas (lunes a domingo) que cubre completo el mes de `monthDate`. */
export function monthGridDays(monthDate: Date): Date[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  const leadingWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = lunes
  const trailingWeekday = (lastOfMonth.getDay() + 6) % 7;

  const start = new Date(year, month, 1 - leadingWeekday);
  const end = new Date(year, month, lastOfMonth.getDate() + (6 - trailingWeekday));

  const days: Date[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    days.push(new Date(cursor));
  }
  return days;
}

/** Agrupa los días de `monthGridDays` en semanas de 7, para renderizar fila por fila sin depender de `flexWrap`. */
export function chunkIntoWeeks(days: Date[]): Date[][] {
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

/**
 * Historial combinado en la forma recortada que consume la tool del agente
 * (`get_training_history`/`get_training_record`). Nunca se inyecta en el
 * prompt: sólo viaja en `ChatRequest.trainingHistory` para que el backend lo
 * resuelva cuando el modelo invoque la tool.
 */
export function buildChatTrainingHistoryEntries(
  plans: TrainingPlan[],
  executions: SessionExecution[],
  activities: GarminActivity[],
  matches: ActivitySessionMatch[],
): ChatTrainingHistoryEntry[] {
  const records = buildCombinedRecords(plans, executions, activities, matches);
  const unlinked = freeActivities(activities, matches);

  const sessionEntries: ChatTrainingHistoryEntry[] = records.map((record) => ({
    kind: "session",
    date: santiagoDayKey(record.execution.startedAt),
    plannedSessionId: record.plannedSession.id,
    plannedTitle: record.plannedSession.title,
    focus: record.plannedSession.focus,
    plannedDurationMinutes: record.plannedSession.plannedDurationMinutes,
    executionStatus: record.execution.status,
    startedAt: record.execution.startedAt,
    finishedAt: record.execution.finishedAt,
    actualRpe: record.execution.actualRpe,
    painLevel: record.execution.painLevel,
    notes: record.execution.notes,
    garminActivityName: record.garminActivity?.name,
    garminActivityType: record.garminActivity?.activityType,
    garminDurationSeconds: record.garminActivity?.durationSeconds,
    garminAverageHeartRate: record.garminActivity?.averageHeartRate,
    garminMaxHeartRate: record.garminActivity?.maxHeartRate,
    garminCalories: record.garminActivity?.calories,
    garminAerobicTrainingEffect: record.garminActivity?.aerobicTrainingEffect,
    garminAnaerobicTrainingEffect: record.garminActivity?.anaerobicTrainingEffect,
    matchStatus: record.match?.status,
    origin: record.execution.sourceExecutionId ? "repeated" : "plan",
    sourceExecutionId: record.execution.sourceExecutionId,
  }));

  const freeActivityEntries: ChatTrainingHistoryEntry[] = unlinked.map((activity) => ({
    kind: "freeActivity",
    date: santiagoDayKey(activity.startedAt),
    garminActivityName: activity.name,
    garminActivityType: activity.activityType,
    garminDurationSeconds: activity.durationSeconds,
    garminAverageHeartRate: activity.averageHeartRate,
    garminMaxHeartRate: activity.maxHeartRate,
    garminCalories: activity.calories,
    garminAerobicTrainingEffect: activity.aerobicTrainingEffect,
    garminAnaerobicTrainingEffect: activity.anaerobicTrainingEffect,
  }));

  return [...sessionEntries, ...freeActivityEntries].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Texto secundario para una ejecución repetida, p. ej. "Repetida desde la
 * sesión del 5 de agosto". `undefined` si `execution` no viene de una
 * repetición o si ya no se encuentra la ejecución original (se descartó).
 */
export function repeatedFromLabel(
  execution: SessionExecution,
  executions: SessionExecution[],
): string | undefined {
  if (!execution.sourceExecutionId) return undefined;
  const source = executions.find((item) => item.id === execution.sourceExecutionId);
  if (!source) return undefined;
  return `Repetida desde la sesión del ${formatSantiagoDayLabel(source.startedAt)}`;
}

export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
