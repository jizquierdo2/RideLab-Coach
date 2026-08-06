import { z } from "zod";
import { mediaUrlSchema } from "./plan";

/**
 * Catálogo local de ejercicios.
 *
 * El agente sólo puede elegir ejercicios de aquí, por `id`. Así no inventa
 * nombres ni enlaces de video. Un ejercicio sin `videoUrl` se muestra en la app
 * como "Video por agregar"; nunca se fabrica una URL.
 */

export const movementPatternSchema = z.enum([
  "squat",
  "hinge",
  "lunge",
  "push",
  "pull",
  "carry",
  "core",
  "jump",
  "mobility",
  "grip",
]);

export const exerciseLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);

export const catalogExerciseSchema = z.object({
  /** ID canónico y estable. Es lo que referencia `catalogExerciseId` del plan. */
  id: z.string().min(1),
  nameEs: z.string().min(1),
  /** Nombre original, normalmente en inglés. */
  nameOriginal: z.string().min(1),
  pattern: movementPatternSchema,
  primaryMuscles: z.array(z.string()).min(1),
  level: exerciseLevelSchema,
  equipment: z.array(z.string()).default([]),
  techniqueCues: z.array(z.string()).min(1),
  commonMistakes: z.array(z.string()).default([]),
  easierAlternative: z.string().optional(),
  harderAlternative: z.string().optional(),
  /** Ausente = "Video por agregar". Nunca inventar. */
  videoUrl: mediaUrlSchema.optional(),
  thumbnailUrl: mediaUrlSchema.optional(),
});

export type MovementPattern = z.infer<typeof movementPatternSchema>;
export type ExerciseLevel = z.infer<typeof exerciseLevelSchema>;
export type CatalogExercise = z.infer<typeof catalogExerciseSchema>;

export const VIDEO_PENDING_LABEL = "Video por agregar";
