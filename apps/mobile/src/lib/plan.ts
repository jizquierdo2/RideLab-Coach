import type {
  PerformanceAssessment,
  SessionStatus,
  TrainingPlan,
  TrainingSession,
  TrainingWeek,
} from "@ridelab/shared";

/** Utilidades de lectura del plan que comparten Entrenamiento y el detalle. */

/** Semana en curso según la fecha de inicio, acotada al largo del plan. */
export function currentWeekNumber(plan: TrainingPlan, now = new Date()): number {
  const start = new Date(`${plan.startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return 1;
  const elapsedWeeks = Math.floor((now.getTime() - start.getTime()) / (7 * 86_400_000));
  return Math.min(Math.max(elapsedWeeks + 1, 1), plan.durationWeeks);
}

export function getWeek(plan: TrainingPlan, weekNumber: number): TrainingWeek | undefined {
  return plan.weeks.find((week) => week.number === weekNumber) ?? plan.weeks[0];
}

export function findSession(
  plan: TrainingPlan,
  sessionId: string,
): { session: TrainingSession; week: TrainingWeek } | undefined {
  for (const week of plan.weeks) {
    const session = week.sessions.find((s) => s.id === sessionId);
    if (session) return { session, week };
  }
  return undefined;
}

/** Primera sesión pendiente de la semana en curso; si no queda ninguna, la siguiente del plan. */
export function nextSession(
  plan: TrainingPlan,
  statuses: Record<string, SessionStatus>,
  now = new Date(),
): TrainingSession | undefined {
  const week = getWeek(plan, currentWeekNumber(plan, now));
  const pendingInWeek = week?.sessions.find((session) => (statuses[session.id] ?? "pending") === "pending");
  if (pendingInWeek) return pendingInWeek;

  for (const candidate of plan.weeks) {
    const pending = candidate.sessions.find((session) => (statuses[session.id] ?? "pending") === "pending");
    if (pending) return pending;
  }
  return undefined;
}

export function countExercises(session: TrainingSession): number {
  return session.sections.reduce((total, section) => total + section.exercises.length, 0);
}

export interface WeekProgress {
  completed: number;
  total: number;
  ratio: number;
}

export function weekProgress(
  week: TrainingWeek | undefined,
  statuses: Record<string, SessionStatus>,
): WeekProgress {
  if (!week) return { completed: 0, total: 0, ratio: 0 };
  const total = week.sessions.length;
  const completed = week.sessions.filter((session) => statuses[session.id] === "completed").length;
  return { completed, total, ratio: total === 0 ? 0 : completed / total };
}

export const STATUS_LABEL: Record<SessionStatus, string> = {
  pending: "Pendiente",
  completed: "Completada",
  skipped: "Omitida",
};

/**
 * Tono visual para un nivel de `PerformanceAssessment`.
 *
 * Antes vivía acá un `recoveryAdvice()` con sus propios umbrales, que competía
 * con `assessPerformance()` de shared y llegó a mostrar un veredicto distinto
 * al de Estado en la misma app. El único motor es el de shared: esto sólo
 * traduce su resultado a color.
 */
export function assessmentTone(level: PerformanceAssessment["level"]): "good" | "warning" | "bad" {
  if (level === "push" || level === "solid") return "good";
  if (level === "controlled") return "warning";
  return "bad";
}
