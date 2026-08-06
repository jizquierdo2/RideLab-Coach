import type { TrainingPlan, TrainingSession } from "../types/plan";
import type { PlannedSession } from "../types/training-history";

/** Proyecta una sesión del plan a la forma liviana que consume el calendario. */
export function toPlannedSession(plan: TrainingPlan, session: TrainingSession): PlannedSession {
  return {
    id: session.id,
    planId: plan.id,
    title: session.title,
    focus: session.focus,
    scheduledDate: session.scheduledDate,
    plannedDurationMinutes: session.estimatedMinutes,
    exerciseCount: session.sections.reduce((total, section) => total + section.exercises.length, 0),
  };
}
