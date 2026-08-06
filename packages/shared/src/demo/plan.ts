import type { TrainingPlan, TrainingSession, TrainingWeek } from "../types/plan";
import { findExercise } from "../catalog/exercises";

/**
 * Plan demo: "MTB Funcional — 2 días por semana".
 *
 * Sirve como ejemplo navegable y como referencia de la forma que debe tener
 * cualquier plan generado por el agente. Los `videoUrl` y `thumbnailUrl` se
 * resuelven desde el catálogo verificado, nunca se escriben a mano.
 */

interface ExerciseSeed {
  catalogExerciseId: string;
  why: string;
  sets?: number;
  reps?: string;
  durationSeconds?: number;
  distanceMeters?: number;
  restSeconds?: number;
  rpe?: string;
  loadGuidance?: string;
}

/** Hidrata un ejercicio del plan con los datos del catálogo. */
function buildExercise(sessionId: string, index: number, seed: ExerciseSeed) {
  const catalogEntry = findExercise(seed.catalogExerciseId);
  if (!catalogEntry) {
    throw new Error(`El plan demo referencia un ejercicio inexistente: ${seed.catalogExerciseId}`);
  }

  return {
    id: `${sessionId}-ex${index + 1}`,
    catalogExerciseId: seed.catalogExerciseId,
    name: catalogEntry.nameEs,
    why: seed.why,
    sets: seed.sets,
    reps: seed.reps,
    durationSeconds: seed.durationSeconds,
    distanceMeters: seed.distanceMeters,
    restSeconds: seed.restSeconds,
    rpe: seed.rpe,
    loadGuidance: seed.loadGuidance,
    techniqueCues: catalogEntry.techniqueCues.slice(0, 3),
    videoUrl: catalogEntry.videoUrl,
    thumbnailUrl: catalogEntry.thumbnailUrl,
  };
}

interface SectionSeed {
  title: string;
  exercises: ExerciseSeed[];
}

function buildSession(
  session: { id: string; dayLabel: string; title: string; focus: string; estimatedMinutes: number },
  sections: SectionSeed[],
): TrainingSession {
  let exerciseCounter = 0;
  return {
    ...session,
    sections: sections.map((section, sectionIndex) => ({
      id: `${session.id}-s${sectionIndex + 1}`,
      title: section.title,
      order: sectionIndex,
      exercises: section.exercises.map((seed) => buildExercise(session.id, exerciseCounter++, seed)),
    })),
  };
}

/** Día 1 — dominante de rodilla: absorber impactos y empujar. */
function buildDayOne(weekNumber: number): TrainingSession {
  const id = `w${weekNumber}-d1`;
  return buildSession(
    {
      id,
      dayLabel: "Día 1",
      title: "Potencia de Empuje e Impacto — Knee Dominant",
      focus: "Absorción de impactos, estabilidad de rodilla, empuje, tracción, core y agarre",
      estimatedMinutes: 60,
    },
    [
      {
        title: "Calentamiento y activación",
        exercises: [
          {
            catalogExerciseId: "worlds-greatest-stretch",
            why: "Abre cadera y torácica antes de cargar, que es donde el MTB te deja más rígido.",
            sets: 2,
            reps: "5 por lado",
            restSeconds: 30,
            rpe: "RPE 3",
          },
          {
            catalogExerciseId: "puente-gluteos",
            why: "Enciende el glúteo para que no compense la lumbar en el resto de la sesión.",
            sets: 2,
            reps: "12",
            restSeconds: 30,
            rpe: "RPE 4",
          },
          {
            catalogExerciseId: "hip-90-90",
            why: "Prepara la rotación de cadera que necesitas para maniobrar la bici.",
            sets: 2,
            reps: "6 por lado",
            restSeconds: 30,
            rpe: "RPE 3",
          },
        ],
      },
      {
        title: "Potencia",
        exercises: [
          {
            catalogExerciseId: "box-jump",
            why: "Entrena la absorción de impacto del aterrizaje, que es lo que más castiga la rodilla en descenso.",
            sets: weekNumber >= 3 ? 4 : 3,
            reps: "4",
            restSeconds: 90,
            rpe: "RPE 6 — calidad sobre cantidad",
            loadGuidance: "Cajón que puedas aterrizar suave y controlado, no el más alto posible",
          },
        ],
      },
      {
        title: "Fuerza y estabilidad",
        exercises: [
          {
            catalogExerciseId: "goblet-squat",
            why: "Base de fuerza en dominante de rodilla para pedalear de pie sin fatigarte.",
            sets: 3,
            reps: weekNumber >= 3 ? "8" : "10",
            restSeconds: 90,
            rpe: "RPE 7",
            loadGuidance:
              weekNumber >= 3
                ? "Sube 2-4 kg respecto de la semana anterior si mantuviste la técnica"
                : "Empieza con un peso que te deje 2 repeticiones de margen",
          },
          {
            catalogExerciseId: "press-inclinado-mancuernas",
            why: "Fuerza de empuje para aguantar el peso del tren superior en terreno técnico.",
            sets: 3,
            reps: "8-10",
            restSeconds: 90,
            rpe: "RPE 7",
          },
        ],
      },
      {
        title: "Trabajo unilateral y tracción",
        exercises: [
          {
            catalogExerciseId: "split-squat-bulgaro",
            why: "Corrige asimetrías entre piernas, muy comunes por el pie de apoyo dominante.",
            sets: 3,
            reps: "8 por pierna",
            restSeconds: 75,
            rpe: "RPE 7",
          },
          {
            catalogExerciseId: "remo-unilateral",
            why: "Equilibra el empuje y sostiene la postura sobre el manubrio.",
            sets: 3,
            reps: "10 por lado",
            restSeconds: 75,
            rpe: "RPE 7",
          },
        ],
      },
      {
        title: "Core y agarre",
        exercises: [
          {
            catalogExerciseId: "farmers-walk",
            why: "Agarre y core anti-lateral: se traduce directo en resistencia de manos en descenso largo.",
            sets: 3,
            distanceMeters: 30,
            restSeconds: 60,
            rpe: "RPE 7",
            loadGuidance: "Peso que te permita 30 m sin soltar",
          },
          {
            catalogExerciseId: "pallof-press",
            why: "Core anti-rotación: estabiliza el torso cuando la rueda delantera se desvía.",
            sets: 3,
            reps: "10 por lado",
            restSeconds: 45,
            rpe: "RPE 6",
          },
        ],
      },
    ],
  );
}

/** Día 2 — bisagra de cadera: posición de ataque y cadena posterior. */
function buildDayTwo(weekNumber: number): TrainingSession {
  const id = `w${weekNumber}-d2`;
  return buildSession(
    {
      id,
      dayLabel: "Día 2",
      title: "Cadena Posterior y Tracción — Hinge",
      focus: "Posición de ataque, bisagra de cadera, cadena posterior, espalda alta, antebrazos y core",
      estimatedMinutes: 60,
    },
    [
      {
        title: "Calentamiento y activación",
        exercises: [
          {
            catalogExerciseId: "bird-dog",
            why: "Estabiliza la columna antes de cargar la bisagra de cadera.",
            sets: 2,
            reps: "8 por lado",
            restSeconds: 30,
            rpe: "RPE 3",
          },
          {
            catalogExerciseId: "puente-gluteos",
            why: "Activa el glúteo para que lidere la bisagra y no los lumbares.",
            sets: 2,
            reps: "12",
            restSeconds: 30,
            rpe: "RPE 4",
          },
          {
            catalogExerciseId: "thread-the-needle",
            why: "Devuelve rotación a la torácica, que se bloquea con horas en posición de ataque.",
            sets: 2,
            reps: "6 por lado",
            restSeconds: 30,
            rpe: "RPE 3",
          },
        ],
      },
      {
        title: "Potencia",
        exercises: [
          {
            catalogExerciseId: "kettlebell-swing",
            why: "Potencia explosiva de cadera: es el gesto del arranque y de salir parado de una subida.",
            sets: weekNumber >= 3 ? 5 : 4,
            reps: "12",
            restSeconds: 60,
            rpe: "RPE 7",
            loadGuidance: "Kettlebell que te permita mantener la bisagra limpia las 12 repeticiones",
          },
        ],
      },
      {
        title: "Fuerza y estabilidad",
        exercises: [
          {
            catalogExerciseId: weekNumber % 2 === 1 ? "trap-bar-deadlift" : "peso-muerto-rumano",
            why:
              weekNumber % 2 === 1
                ? "Fuerza máxima de cadena posterior con la espalda en posición más segura que la barra recta."
                : "Alterna el estímulo hacia el isquiotibial y el control excéntrico.",
            sets: 3,
            reps: weekNumber >= 3 ? "5" : "6",
            restSeconds: 120,
            rpe: "RPE 7-8",
            loadGuidance: "Deja siempre 2 repeticiones en reserva; la técnica manda",
          },
          {
            catalogExerciseId: "press-militar-mancuernas",
            why: "Hombro fuerte y estable para absorber golpes con los brazos.",
            sets: 3,
            reps: "8",
            restSeconds: 90,
            rpe: "RPE 7",
          },
        ],
      },
      {
        title: "Trabajo unilateral y tracción",
        exercises: [
          {
            catalogExerciseId: "step-up",
            why: "Fuerza unilateral en un patrón muy parecido al pedaleo de pie.",
            sets: 3,
            reps: "10 por pierna",
            restSeconds: 75,
            rpe: "RPE 7",
          },
          {
            catalogExerciseId: weekNumber >= 3 ? "dominada" : "jalon-al-pecho",
            why:
              weekNumber >= 3
                ? "Tracción vertical con peso corporal, una vez construida la base en polea."
                : "Construye la tracción vertical con carga controlable antes de pasar a dominadas.",
            sets: 3,
            reps: weekNumber >= 3 ? "5-8" : "10",
            restSeconds: 90,
            rpe: "RPE 7",
          },
        ],
      },
      {
        title: "Core y agarre — finisher",
        exercises: [
          {
            catalogExerciseId: "dead-hang",
            why: "Resistencia de antebrazo: es lo primero que se agota en descensos largos.",
            sets: 3,
            durationSeconds: 30,
            restSeconds: 60,
            rpe: "RPE 7",
            loadGuidance: "Sube 5 segundos cuando completes las 3 series limpias",
          },
          {
            catalogExerciseId: "dead-bug",
            why: "Core anti-extensión, para que la lumbar no cargue lo que debería aguantar el abdomen.",
            sets: 3,
            reps: "10 por lado",
            restSeconds: 45,
            rpe: "RPE 6",
          },
          {
            catalogExerciseId: "plancha-abdominal",
            why: "Cierra con tensión isométrica global.",
            sets: 2,
            durationSeconds: 40,
            restSeconds: 45,
            rpe: "RPE 6",
          },
        ],
      },
    ],
  );
}

const WEEK_OBJECTIVES = [
  "Adaptación: aprender los patrones y fijar cargas de referencia",
  "Consolidación: repetir cargas con mejor técnica y algo más de volumen",
  "Progresión: subir carga y bajar repeticiones en los básicos",
  "Descarga: mantener el estímulo con menos volumen para asimilar",
];

function buildWeek(number: number): TrainingWeek {
  return {
    number,
    objective: WEEK_OBJECTIVES[number - 1] ?? "Mantener el estímulo",
    sessions: [buildDayOne(number), buildDayTwo(number)],
  };
}

/** Fecha de inicio del plan demo: lunes de la semana en curso. */
function currentMonday(reference = new Date()): string {
  const date = new Date(reference);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function buildDemoPlan(reference = new Date()): TrainingPlan {
  return {
    id: "demo-mtb-funcional",
    title: "MTB Funcional — 2 días por semana",
    goal: "Aguantar descensos largos sin perder control ni agarre, y subir con más potencia",
    sport: "Mountain bike",
    durationWeeks: 4,
    daysPerWeek: 2,
    sessionDurationMinutes: 60,
    startDate: currentMonday(reference),
    generatedAt: reference.toISOString(),
    sourceContext: {
      garminPeriod: "Últimas 4 semanas (datos de demostración)",
      userGoals: ["Resistir descensos largos", "Más potencia en subidas cortas"],
      limitations: [],
      equipment: ["Mancuernas", "Kettlebell", "Barra hexagonal", "Cajón", "Barra de dominadas", "Banda elástica"],
    },
    weeks: [buildWeek(1), buildWeek(2), buildWeek(3), buildWeek(4)],
  };
}

export const DEMO_PLAN_ID = "demo-mtb-funcional";
