import { describe, expect, it } from "vitest";
import type { ChatRequest } from "@ridelab/shared";
import { resolveAthleteProfile } from "./profile";

function conversation(...userTurns: string[]): ChatRequest {
  return {
    messages: userTurns.map((content) => ({ role: "user" as const, content })),
    recentLogs: [],
    trainingHistory: [],
    subjectiveNotes: [],
  };
}

describe("resolveAthleteProfile", () => {
  it("pide todo cuando el usuario sólo pide un plan", () => {
    const { missing } = resolveAthleteProfile(conversation("Créame un plan"));
    expect(missing.length).toBeGreaterThanOrEqual(5);
  });

  it("lee los datos que el usuario fue respondiendo en la conversación", () => {
    const { profile, missing } = resolveAthleteProfile(
      conversation(
        "Créame un plan funcional para MTB de dos días por semana",
        "Quiero aguantar descensos largos, tengo una hora por sesión",
        "Tengo mancuernas y kettlebell, experiencia intermedia",
        "Ninguna molestia",
      ),
    );

    expect(profile.daysPerWeek).toBe(2);
    expect(profile.sessionDurationMinutes).toBe(60);
    expect(profile.equipment).toEqual(expect.arrayContaining(["Mancuernas", "Kettlebell"]));
    expect(profile.experienceLevel).toBe("intermediate");
    expect(profile.goals).toContain("Resistir descensos largos");
    expect(missing).toHaveLength(0);
  });

  it("entiende cifras escritas con dígitos y minutos explícitos", () => {
    const { profile } = resolveAthleteProfile(
      conversation("Entreno 3 días por semana, 45 minutos, en gimnasio, soy principiante, ninguna lesión, quiero fuerza"),
    );

    expect(profile.daysPerWeek).toBe(3);
    expect(profile.sessionDurationMinutes).toBe(45);
    expect(profile.experienceLevel).toBe("beginner");
    expect(profile.equipment.length).toBeGreaterThan(0);
  });

  it("registra una molestia declarada como limitación", () => {
    const { profile, missing } = resolveAthleteProfile(
      conversation(
        "Plan de dos días por semana, una hora, con mancuernas, nivel intermedio, quiero fuerza",
        "Tengo dolor en la rodilla derecha",
      ),
    );

    expect(profile.limitations).toContain("Molestia en la rodilla");
    expect(missing).toHaveLength(0);
  });

  it("distingue 'ninguna' de no haber preguntado todavía", () => {
    const withoutAnswer = resolveAthleteProfile(
      conversation("Plan de dos días, una hora, mancuernas, intermedio, quiero fuerza"),
    );
    expect(withoutAnswer.missing.join(" ")).toContain("molestia");

    const withAnswer = resolveAthleteProfile(
      conversation("Plan de dos días, una hora, mancuernas, intermedio, quiero fuerza", "ninguna"),
    );
    expect(withAnswer.missing).toHaveLength(0);
  });

  it("da prioridad al perfil ya guardado y no lo vuelve a preguntar", () => {
    const { profile, missing } = resolveAthleteProfile({
      messages: [{ role: "user", content: "Créame un plan" }],
      recentLogs: [],
      trainingHistory: [],
      subjectiveNotes: [],
      athleteProfile: {
        goals: ["Ganar fuerza"],
        daysPerWeek: 4,
        sessionDurationMinutes: 75,
        equipment: ["Barra"],
        experienceLevel: "advanced",
        limitations: ["Molestia en el hombro"],
        weeklySports: ["MTB"],
      },
    });

    expect(missing).toHaveLength(0);
    expect(profile.daysPerWeek).toBe(4);
    expect(profile.sessionDurationMinutes).toBe(75);
  });
});
