import { z } from "zod";

/**
 * Registro de lo que realmente se hizo en una sesión.
 *
 * Es la memoria que le permite al agente responder "¿qué peso ocupé la última
 * vez?" o "¿estoy progresando?". Se guarda local y se envía como contexto.
 */

export const exerciseLogSchema = z.object({
  exerciseId: z.string().min(1),
  catalogExerciseId: z.string().min(1),
  name: z.string().min(1),
  completed: z.boolean().default(false),
  /** Carga usada, en texto libre: "20 kg", "banda roja", "peso corporal". */
  load: z.string().optional(),
  /** Repeticiones reales, que pueden diferir de las prescritas. */
  actualReps: z.string().optional(),
  notes: z.string().optional(),
});

export const painReportSchema = z.object({
  /** Escala 0-10. */
  level: z.number().int().min(0).max(10),
  location: z.string().optional(),
  notes: z.string().optional(),
});

export const sessionLogSchema = z.object({
  id: z.string().min(1),
  planId: z.string().min(1),
  sessionId: z.string().min(1),
  sessionTitle: z.string().min(1),
  weekNumber: z.number().int().positive(),
  completedAt: z.string(),
  actualDurationMinutes: z.number().int().nonnegative().max(600).optional(),
  /** RPE global de la sesión, 1-10. */
  sessionRpe: z.number().int().min(1).max(10).optional(),
  pain: painReportSchema.optional(),
  comment: z.string().optional(),
  exercises: z.array(exerciseLogSchema).default([]),
});

export type ExerciseLog = z.infer<typeof exerciseLogSchema>;
export type PainReport = z.infer<typeof painReportSchema>;
export type SessionLog = z.infer<typeof sessionLogSchema>;

/** Nivel de dolor desde el cual el agente debe derivar a un profesional. */
export const PAIN_ESCALATION_THRESHOLD = 6;

export const PAIN_ESCALATION_MESSAGE =
  "Reportaste dolor relevante. No puedo diagnosticar: detén o modifica el ejercicio que lo provoca y consulta a un profesional de la salud.";

export function needsPainEscalation(log: Pick<SessionLog, "pain">): boolean {
  return (log.pain?.level ?? 0) >= PAIN_ESCALATION_THRESHOLD;
}
