import { z } from "zod";

/**
 * Esquemas del plan de entrenamiento.
 *
 * Zod es la fuente de verdad: los tipos TypeScript se derivan con `z.infer`.
 * Todo plan que venga del agente DEBE pasar por `trainingPlanSchema.parse`
 * antes de persistirse. Nunca se reconstruye un plan leyendo Markdown.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Debe ser una fecha ISO (YYYY-MM-DD)");

/**
 * URL de media (video o miniatura).
 *
 * `z.string().url()` por sí solo es demasiado permisivo: acepta esquemas
 * arbitrarios como `youtube: busca box jump`. Aquí se exige http(s) y se
 * rechazan los enlaces a búsquedas, que es exactamente lo que produce un agente
 * cuando no tiene un video real.
 */
export const mediaUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\/[^\s]+\.[^\s]+/i.test(value), {
    message: "Debe ser una URL http(s) a un recurso concreto",
  })
  .refine((value) => !/\/results\?|search_query=|\/search\b/i.test(value), {
    message: "No se permiten enlaces a búsquedas: usa la URL del video",
  });

export const trainingExerciseSchema = z.object({
  id: z.string().min(1),
  /** Referencia al catálogo local. El agente elige de aquí, no inventa ejercicios. */
  catalogExerciseId: z.string().min(1),
  name: z.string().min(1),
  /** Por qué este ejercicio está en la sesión. */
  why: z.string().min(1),
  sets: z.number().int().positive().max(20).optional(),
  reps: z.string().optional(),
  durationSeconds: z.number().int().positive().max(7200).optional(),
  distanceMeters: z.number().positive().max(100000).optional(),
  restSeconds: z.number().int().nonnegative().max(1800).optional(),
  rpe: z.string().optional(),
  loadGuidance: z.string().optional(),
  techniqueCues: z.array(z.string()).default([]),
  videoUrl: mediaUrlSchema.optional(),
  thumbnailUrl: mediaUrlSchema.optional(),
});

export const trainingSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  order: z.number().int().nonnegative(),
  exercises: z.array(trainingExerciseSchema).min(1, "Una sección necesita al menos un ejercicio"),
});

export const trainingSessionSchema = z.object({
  id: z.string().min(1),
  dayLabel: z.string().min(1),
  title: z.string().min(1),
  focus: z.string().min(1),
  estimatedMinutes: z.number().int().positive().max(400),
  scheduledDate: isoDate.optional(),
  sections: z.array(trainingSectionSchema).min(1, "Una sesión necesita al menos una sección"),
  /** Versión de la plantilla, para "repetir sesión". Ausente = versión 1 (planes ya existentes). */
  version: z.number().int().positive().optional(),
});

export const trainingWeekSchema = z.object({
  number: z.number().int().positive(),
  objective: z.string().min(1),
  sessions: z.array(trainingSessionSchema).min(1, "Una semana necesita al menos una sesión"),
});

export const trainingPlanSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  sport: z.string().min(1),
  durationWeeks: z.number().int().positive().max(52),
  daysPerWeek: z.number().int().positive().max(7),
  sessionDurationMinutes: z.number().int().positive().max(400),
  startDate: isoDate,
  generatedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  sourceContext: z.object({
    garminPeriod: z.string().optional(),
    userGoals: z.array(z.string()).default([]),
    limitations: z.array(z.string()).default([]),
    equipment: z.array(z.string()).default([]),
  }),
  weeks: z.array(trainingWeekSchema).min(1, "Un plan necesita al menos una semana"),
});

export type TrainingExercise = z.infer<typeof trainingExerciseSchema>;
export type TrainingSection = z.infer<typeof trainingSectionSchema>;
export type TrainingSession = z.infer<typeof trainingSessionSchema>;
export type TrainingWeek = z.infer<typeof trainingWeekSchema>;
export type TrainingPlan = z.infer<typeof trainingPlanSchema>;

/** Estado de una sesión dentro del plan activo. */
export type SessionStatus = "pending" | "completed" | "skipped";

/**
 * Valida un plan propuesto por el agente.
 *
 * Además del schema, verifica coherencia estructural que Zod no cubre:
 * que la cantidad de semanas coincida con `durationWeeks` y que cada semana
 * respete `daysPerWeek`.
 */
export function validateTrainingPlan(
  input: unknown,
): { ok: true; plan: TrainingPlan } | { ok: false; errors: string[] } {
  const parsed = trainingPlanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(raíz)"}: ${i.message}`),
    };
  }

  const plan = parsed.data;
  const errors: string[] = [];

  if (plan.weeks.length !== plan.durationWeeks) {
    errors.push(
      `durationWeeks es ${plan.durationWeeks} pero el plan trae ${plan.weeks.length} semana(s)`,
    );
  }

  for (const week of plan.weeks) {
    if (week.sessions.length > plan.daysPerWeek) {
      errors.push(
        `La semana ${week.number} tiene ${week.sessions.length} sesiones y daysPerWeek es ${plan.daysPerWeek}`,
      );
    }
  }

  const seenSessionIds = new Set<string>();
  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      if (seenSessionIds.has(session.id)) {
        errors.push(`El id de sesión "${session.id}" está repetido`);
      }
      seenSessionIds.add(session.id);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, plan };
}
