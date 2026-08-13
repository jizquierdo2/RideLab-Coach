import { z } from "zod";

/**
 * Memoria estructurada del atleta, acumulada por `summarizeMemory()`
 * (Fase 7) a partir de las conversaciones que ya salieron de la ventana
 * activa de 7 días. Cada campo es una lista corta de hechos en prosa, no un
 * objeto anidado — así el propio modelo puede reescribirla en cada pasada sin
 * tener que razonar sobre una estructura rígida, y el "los datos más
 * recientes reemplazan a los antiguos" queda a cargo del prompt de
 * `summarizeMemory`, no de lógica de merge en código.
 */
export const structuredMemorySchema = z.object({
  /** Objetivos declarados (ej. "bajar con más control en pistas técnicas"). */
  goals: z.array(z.string()).default([]),
  /** Preferencias de entrenamiento (ej. "prefiere entrenar de mañana"). */
  preferences: z.array(z.string()).default([]),
  /** Lesiones o limitaciones físicas vigentes. */
  limitations: z.array(z.string()).default([]),
  /** Rutinas o hábitos recurrentes mencionados. */
  routines: z.array(z.string()).default([]),
  /** Cargas o progresiones acordadas (ej. "sentadilla en 80 kg x 5"). */
  loads: z.array(z.string()).default([]),
  /** Feedback subjetivo recurrente sobre cómo se siente el atleta. */
  feedback: z.array(z.string()).default([]),
  /** Decisiones o ajustes acordados explícitamente con el atleta. */
  decisions: z.array(z.string()).default([]),
  /** Progreso observado a lo largo del tiempo. */
  progress: z.array(z.string()).default([]),
  /** Ajustes pendientes o próximos a aplicar. */
  adjustments: z.array(z.string()).default([]),
});

export type StructuredMemory = z.infer<typeof structuredMemorySchema>;

/** Estructura vacía — punto de partida cuando todavía no existe ningún resumen. */
export function emptyStructuredMemory(): StructuredMemory {
  return {
    goals: [],
    preferences: [],
    limitations: [],
    routines: [],
    loads: [],
    feedback: [],
    decisions: [],
    progress: [],
    adjustments: [],
  };
}
