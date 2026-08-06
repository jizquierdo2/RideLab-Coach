import { describe, expect, it } from "vitest";
import { EXERCISE_CATALOG, CATALOG_IDS, findExercise } from "./exercises";
import { catalogExerciseSchema } from "../types/catalog";

describe("catálogo de ejercicios", () => {
  it("incluye los 22 ejercicios del plan demo", () => {
    expect(EXERCISE_CATALOG).toHaveLength(22);
  });

  it("cumple el schema en todas sus entradas", () => {
    for (const exercise of EXERCISE_CATALOG) {
      const parsed = catalogExerciseSchema.safeParse(exercise);
      expect(parsed.success, `${exercise.id} no cumple el schema`).toBe(true);
    }
  });

  it("no tiene IDs duplicados", () => {
    expect(new Set(CATALOG_IDS).size).toBe(CATALOG_IDS.length);
  });

  it("cubre los ejercicios pedidos para el plan demo", () => {
    const required = [
      "plancha-abdominal",
      "puente-gluteos",
      "hip-90-90",
      "box-jump",
      "goblet-squat",
      "press-inclinado-mancuernas",
      "split-squat-bulgaro",
      "remo-unilateral",
      "farmers-walk",
      "pallof-press",
      "worlds-greatest-stretch",
      "bird-dog",
      "dead-bug",
      "kettlebell-swing",
      "trap-bar-deadlift",
      "peso-muerto-rumano",
      "press-militar-mancuernas",
      "step-up",
      "dominada",
      "jalon-al-pecho",
      "dead-hang",
      "thread-the-needle",
    ];

    for (const id of required) {
      expect(findExercise(id), `falta ${id}`).toBeDefined();
    }
  });

  it("nunca apunta a búsquedas ni a URLs inventadas", () => {
    for (const exercise of EXERCISE_CATALOG) {
      if (!exercise.videoUrl) continue;
      expect(exercise.videoUrl).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/);
      expect(exercise.videoUrl).not.toContain("/results");
      expect(exercise.videoUrl).not.toContain("search_query");
    }
  });

  it("deriva la miniatura del mismo video verificado", () => {
    for (const exercise of EXERCISE_CATALOG) {
      if (!exercise.videoUrl || !exercise.thumbnailUrl) continue;
      const videoId = exercise.videoUrl.split("v=")[1];
      expect(exercise.thumbnailUrl).toContain(videoId);
    }
  });

  it("entrega cues y errores frecuentes para poder explicar la técnica", () => {
    for (const exercise of EXERCISE_CATALOG) {
      expect(exercise.techniqueCues.length).toBeGreaterThanOrEqual(2);
      expect(exercise.commonMistakes.length).toBeGreaterThanOrEqual(1);
      expect(exercise.easierAlternative).toBeTruthy();
      expect(exercise.harderAlternative).toBeTruthy();
    }
  });
});
