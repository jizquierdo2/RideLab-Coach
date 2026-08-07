import { z } from "zod";

/**
 * Nota subjetiva del atleta ("cómo me siento hoy"): texto libre, no una
 * métrica medida por Garmin. Sirve como contexto adicional para el coach,
 * nunca para el motor determinístico de `assessPerformance` — el nivel de
 * Estado siempre se calcula sólo desde métricas objetivas.
 */
export const wellnessNoteSchema = z.object({
  id: z.string().min(1),
  /** Día local (America/Santiago), YYYY-MM-DD. Una nota por día: guardar de nuevo reemplaza la anterior. */
  date: z.string(),
  note: z.string().min(1).max(500),
  createdAt: z.string(),
});

export type WellnessNote = z.infer<typeof wellnessNoteSchema>;
