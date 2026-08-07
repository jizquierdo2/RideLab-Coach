import { EXERCISE_CATALOG, RIDING_DISCIPLINES, type AthleteProfile, type ChatRequest, type RidingDiscipline } from "@ridelab/shared";

/**
 * Extrae el perfil del atleta desde la conversación.
 *
 * El coach simulado no tiene un modelo que interprete lenguaje natural, así que
 * lee las respuestas del usuario con reglas explícitas. Lo que ya está guardado
 * en `athleteProfile` manda: nunca se vuelve a preguntar algo ya contestado.
 */

const WORD_NUMBERS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
};

/** Equipamiento reconocible, derivado del catálogo para no duplicar listas. */
const EQUIPMENT_KEYWORDS = Array.from(
  new Set(EXERCISE_CATALOG.flatMap((exercise) => exercise.equipment)),
).filter((item) => item !== "Peso corporal");

function userText(request: ChatRequest): string {
  return request.messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.toLowerCase())
    .join(" \n ");
}

function parseDaysPerWeek(text: string): number | undefined {
  const digit = text.match(/(\d)\s*(?:d[íi]as?|veces|sesiones)\s*(?:por|a la|\/)?\s*semana/);
  if (digit) return Number(digit[1]);

  const word = text.match(/\b(un|uno|una|dos|tres|cuatro|cinco|seis|siete)\s*(?:d[íi]as?|veces|sesiones)/);
  if (word && word[1] && WORD_NUMBERS[word[1]]) return WORD_NUMBERS[word[1]];

  return undefined;
}

function parseSessionMinutes(text: string): number | undefined {
  const minutes = text.match(/(\d{2,3})\s*(?:min|minutos)/);
  if (minutes) return Number(minutes[1]);

  if (/\b(una\s*hora|1\s*hora|60\s*min)/.test(text)) return 60;
  if (/\b(hora y media|90\s*min)/.test(text)) return 90;
  if (/\bmedia hora\b/.test(text)) return 30;

  const hours = text.match(/(\d)\s*horas?/);
  if (hours) return Number(hours[1]) * 60;

  return undefined;
}

function parseEquipment(text: string): string[] {
  if (/\b(gimnasio|gym|gimnasio completo)\b/.test(text)) {
    return EQUIPMENT_KEYWORDS;
  }

  const found = EQUIPMENT_KEYWORDS.filter((item) => text.includes(item.toLowerCase()));
  if (/\bkettlebell/.test(text) && !found.includes("Kettlebell")) found.push("Kettlebell");
  if (/\bmancuerna/.test(text) && !found.includes("Mancuernas")) found.push("Mancuernas");
  if (/\bbarra\b/.test(text) && !found.includes("Barra")) found.push("Barra");
  if (/\b(peso corporal|sin equipo|nada de equipo)\b/.test(text)) found.push("Peso corporal");

  return Array.from(new Set(found));
}

function parseExperience(text: string): AthleteProfile["experienceLevel"] {
  // Se aceptan las formas en masculino y femenino ("nivel intermedio",
  // "experiencia intermedia"), que es como responde la gente en la práctica.
  if (/\b(principiante|inicial|nunca he|reci[ée]n empiezo|nuevo en)\b/.test(text)) return "beginner";
  if (/\b(avanzad[oa]|muchos a[ñn]os|experimentad[oa])\b/.test(text)) return "advanced";
  if (/\b(intermedi[oa]|algo de experiencia|un par de a[ñn]os)\b/.test(text)) return "intermediate";
  return undefined;
}

/**
 * Detecta que el usuario declaró NO tener limitaciones.
 * Es distinto de "todavía no preguntamos": por eso devuelve un booleano aparte.
 */
function declaresNoLimitations(text: string): boolean {
  return /\b(ninguna|ninguno|sin lesiones|sin molestias|no tengo (lesiones|molestias|nada)|nada que reportar|todo bien)\b/.test(
    text,
  );
}

function parseLimitations(text: string): string[] {
  const limitations: string[] = [];
  const parts: Array<[RegExp, string]> = [
    [/\brodilla/, "Molestia en la rodilla"],
    [/\b(espalda|lumbar)/, "Molestia en la espalda baja"],
    [/\bhombro/, "Molestia en el hombro"],
    [/\bmu[ñn]eca/, "Molestia en la muñeca"],
    [/\btobillo/, "Molestia en el tobillo"],
    [/\bcadera/, "Molestia en la cadera"],
  ];

  for (const [pattern, label] of parts) {
    if (pattern.test(text) && /\b(dolor|molestia|lesi[óo]n|me duele|problema)/.test(text)) {
      limitations.push(label);
    }
  }
  return limitations;
}

/** "peso 90 kilos", "peso mas o menos 90 kg" — el número inmediatamente antes de kilo(s)/kg. */
function parseWeightKg(text: string): number | undefined {
  const match = text.match(/(\d{2,3}(?:[.,]\d)?)\s*(?:kilos?|kg)\b/);
  return match ? Number(match[1].replace(",", ".")) : undefined;
}

/** "mido 187", "1.87 m", "187 cm" — cubre las tres formas más comunes de decir la estatura. */
function parseHeightCm(text: string): number | undefined {
  const meters = text.match(/(?:mido\s*)?1[.,](\d{2})\s*m(?:etros)?\b/);
  if (meters) return 100 + Number(meters[1]);

  const cm = text.match(/(?:mido\s*)?(1\d{2})\s*cm\b/);
  if (cm) return Number(cm[1]);

  const bare = text.match(/\bmido\s*(1\d{2})\b/);
  if (bare) return Number(bare[1]);

  return undefined;
}

function parseRidingDisciplines(text: string): RidingDiscipline[] {
  const found = new Set<RidingDiscipline>();
  if (/\b(xc|cross[\s-]?country)\b/.test(text)) found.add("xc");
  if (/\btrail\b/.test(text)) found.add("trail");
  if (/\benduro\b/.test(text)) found.add("enduro");
  if (/\b(downhill|dh)\b/.test(text)) found.add("downhill");
  if (/\bgravel\b/.test(text)) found.add("gravel");
  if (/\be-?bike\b/.test(text)) found.add("e-bike");
  return RIDING_DISCIPLINES.filter((discipline) => found.has(discipline));
}

function parseGoals(text: string): string[] {
  const goals: string[] = [];
  if (/\b(descenso|bajada|downhill|enduro)/.test(text)) goals.push("Resistir descensos largos");
  if (/\b(subida|trepar|climb|potencia)/.test(text)) goals.push("Más potencia en subidas");
  if (/\b(resistencia|fondo|aguantar)/.test(text)) goals.push("Más resistencia general");
  if (/\b(fuerza|fuerte)/.test(text)) goals.push("Ganar fuerza");
  if (/\b(mtb|monta[ñn]a|bicicleta|bici)/.test(text) && goals.length === 0) {
    goals.push("Rendir mejor en MTB");
  }
  return goals;
}

export interface ResolvedProfile {
  profile: AthleteProfile;
  /** Preguntas que siguen sin respuesta. Vacío = se puede generar el plan. */
  missing: string[];
}

/**
 * Combina lo guardado con lo dicho en la conversación y reporta qué falta.
 */
export function resolveAthleteProfile(request: ChatRequest): ResolvedProfile {
  const stored = request.athleteProfile;
  const text = userText(request);

  const goals = stored?.goals?.length ? stored.goals : parseGoals(text);
  const daysPerWeek = stored?.daysPerWeek ?? parseDaysPerWeek(text);
  const sessionDurationMinutes = stored?.sessionDurationMinutes ?? parseSessionMinutes(text);
  const equipment = stored?.equipment?.length ? stored.equipment : parseEquipment(text);
  const experienceLevel = stored?.experienceLevel ?? parseExperience(text);

  const parsedLimitations = parseLimitations(text);
  // Un `limitations: []` guardado significa "ya lo preguntamos y no tiene",
  // que es distinto de no haberlo preguntado nunca (`undefined`).
  const limitationsKnown =
    stored?.limitations !== undefined || parsedLimitations.length > 0 || declaresNoLimitations(text);
  const limitations = stored?.limitations?.length ? stored.limitations : parsedLimitations;

  const missing: string[] = [];
  if (!goals.length) missing.push("¿Cuál es tu objetivo principal?");
  if (!daysPerWeek) missing.push("¿Cuántos días por semana puedes entrenar?");
  if (!sessionDurationMinutes) missing.push("¿De cuánto tiempo dispones por sesión?");
  if (!equipment.length) missing.push("¿Qué equipamiento tienes disponible?");
  if (!experienceLevel) missing.push("¿Cómo describirías tu experiencia en fuerza? (inicial, intermedia o avanzada)");
  if (!limitationsKnown) missing.push("¿Tienes alguna molestia, lesión o restricción? Si no, dime \"ninguna\".");

  return {
    profile: {
      goals,
      daysPerWeek,
      sessionDurationMinutes,
      equipment,
      experienceLevel,
      limitations,
      weeklySports: stored?.weeklySports ?? [],
      weightKg: stored?.weightKg ?? parseWeightKg(text),
      heightCm: stored?.heightCm ?? parseHeightCm(text),
      ridingDisciplines: stored?.ridingDisciplines?.length ? stored.ridingDisciplines : parseRidingDisciplines(text),
      notes: stored?.notes,
    },
    missing,
  };
}
