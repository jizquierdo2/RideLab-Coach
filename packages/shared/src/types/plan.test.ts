import { describe, expect, it } from "vitest";
import { validateTrainingPlan, trainingPlanSchema } from "./plan";
import { buildDemoPlan } from "../demo/plan";
import { findExercise } from "../catalog/exercises";

const basePlan = () => buildDemoPlan(new Date("2026-08-04T12:00:00.000Z"));

describe("validateTrainingPlan", () => {
  it("acepta el plan demo completo", () => {
    const result = validateTrainingPlan(basePlan());
    expect(result.ok).toBe(true);
  });

  it("rechaza un plan sin semanas", () => {
    const result = validateTrainingPlan({ ...basePlan(), weeks: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("al menos una semana");
    }
  });

  it("rechaza una sesión sin secciones", () => {
    const plan = basePlan();
    plan.weeks[0].sessions[0].sections = [];
    const result = validateTrainingPlan(plan);
    expect(result.ok).toBe(false);
  });

  it("rechaza una sección sin ejercicios", () => {
    const plan = basePlan();
    plan.weeks[0].sessions[0].sections[0].exercises = [];
    const result = validateTrainingPlan(plan);
    expect(result.ok).toBe(false);
  });

  it("rechaza un ejercicio sin catalogExerciseId", () => {
    const plan = basePlan();
    // @ts-expect-error se elimina a propósito para probar la validación
    delete plan.weeks[0].sessions[0].sections[0].exercises[0].catalogExerciseId;
    const result = validateTrainingPlan(plan);
    expect(result.ok).toBe(false);
  });

  it("rechaza una URL de video que no sea URL", () => {
    const plan = basePlan();
    plan.weeks[0].sessions[0].sections[0].exercises[0].videoUrl = "busca en youtube";
    const result = validateTrainingPlan(plan);
    expect(result.ok).toBe(false);
  });

  it("rechaza cuando durationWeeks no coincide con las semanas entregadas", () => {
    const plan = basePlan();
    plan.durationWeeks = 8;
    const result = validateTrainingPlan(plan);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("durationWeeks");
    }
  });

  it("rechaza cuando una semana excede daysPerWeek", () => {
    const plan = basePlan();
    plan.daysPerWeek = 1;
    const result = validateTrainingPlan(plan);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("daysPerWeek");
    }
  });

  it("rechaza ids de sesión duplicados", () => {
    const plan = basePlan();
    plan.weeks[0].sessions[1].id = plan.weeks[0].sessions[0].id;
    const result = validateTrainingPlan(plan);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("repetido");
    }
  });

  it("rechaza fechas que no son ISO", () => {
    const plan = basePlan();
    plan.startDate = "04-08-2026";
    expect(trainingPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("no acepta texto Markdown como plan", () => {
    const result = validateTrainingPlan("# Plan\n- Día 1: sentadillas");
    expect(result.ok).toBe(false);
  });
});

describe("plan demo", () => {
  it("referencia sólo ejercicios que existen en el catálogo", () => {
    const plan = basePlan();
    const referenced = plan.weeks.flatMap((week) =>
      week.sessions.flatMap((session) =>
        session.sections.flatMap((section) => section.exercises.map((e) => e.catalogExerciseId)),
      ),
    );

    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) {
      expect(findExercise(id), `catalogExerciseId inexistente: ${id}`).toBeDefined();
    }
  });

  it("tiene 4 semanas de 2 sesiones y los dos días pedidos", () => {
    const plan = basePlan();
    expect(plan.weeks).toHaveLength(4);
    for (const week of plan.weeks) {
      expect(week.sessions).toHaveLength(2);
    }
    expect(plan.weeks[0].sessions[0].title).toContain("Knee Dominant");
    expect(plan.weeks[0].sessions[1].title).toContain("Hinge");
  });

  it("organiza cada sesión en los bloques esperados", () => {
    const plan = basePlan();
    const titles = plan.weeks[0].sessions[0].sections.map((s) => s.title);
    expect(titles[0]).toContain("Calentamiento");
    expect(titles[1]).toContain("Potencia");
    expect(titles).toContain("Fuerza y estabilidad");
    expect(titles).toContain("Trabajo unilateral y tracción");
  });
});
