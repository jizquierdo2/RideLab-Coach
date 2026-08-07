import { z } from "zod";
import { trainingPlanSchema } from "./plan";
import { garminSnapshotSchema } from "./garmin";
import { wellnessNoteSchema } from "./wellness";

/**
 * Contrato del chat entre la app y el backend.
 *
 * La respuesta del agente no es sólo texto: viene descompuesta en conclusión,
 * chips de métricas, interpretación y recomendación, para que la UI pueda
 * renderizar tarjetas en vez de un muro de Markdown.
 */

export const chatRoleSchema = z.enum(["user", "assistant", "system"]);

/** Chip de métrica: "Sueño · 6 h 42 min". */
export const metricChipSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  /** Matiza el color del chip según si la métrica juega a favor o en contra. */
  tone: z.enum(["neutral", "good", "warning", "bad"]).default("neutral"),
});

/**
 * Distinción obligatoria entre dato, interpretación y recomendación.
 * La UI las renderiza en bloques visualmente separados.
 */
export const coachAnalysisSchema = z.object({
  /** Conclusión principal, una frase. */
  headline: z.string().min(1),
  metrics: z.array(metricChipSchema).default([]),
  /** Qué significan los datos, marcado como lectura y no como hecho. */
  interpretation: z.string().optional(),
  /** Qué hacer al respecto. */
  recommendation: z.string().optional(),
  /** Periodo analizado. Obligatorio cuando se habla de datos del usuario. */
  period: z.string().optional(),
  lastSyncAt: z.string().optional(),
  /** Métricas consultadas que no existían. */
  unavailableMetrics: z.array(z.string()).default([]),
  dataSource: z.enum(["mock", "garmin-mcp", "agent-endpoint"]).optional(),
});

export const planProposalSchema = z.object({
  plan: trainingPlanSchema,
  /** Resumen corto para la tarjeta del chat. */
  summary: z.string().min(1),
});

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  role: chatRoleSchema,
  content: z.string(),
  createdAt: z.string(),
  analysis: coachAnalysisSchema.optional(),
  planProposal: planProposalSchema.optional(),
  /** Marca los mensajes generados con datos simulados. */
  isDemoData: z.boolean().optional(),
  error: z.string().optional(),
});

/** Disciplinas de MTB reconocidas — cada una tiene demandas físicas distintas. */
export const RIDING_DISCIPLINES = ["xc", "trail", "enduro", "downhill", "gravel", "e-bike"] as const;
export type RidingDiscipline = (typeof RIDING_DISCIPLINES)[number];

/** Lo que el usuario ya contestó, para no volver a preguntarlo. */
export const athleteProfileSchema = z.object({
  goals: z.array(z.string()).default([]),
  daysPerWeek: z.number().int().min(1).max(7).optional(),
  sessionDurationMinutes: z.number().int().positive().optional(),
  equipment: z.array(z.string()).default([]),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  limitations: z.array(z.string()).default([]),
  weeklySports: z.array(z.string()).default([]),
  /** Para calibrar cargas (loadGuidance) sin que el usuario tenga que repetirlo en cada mensaje. */
  weightKg: z.number().positive().max(300).optional(),
  heightCm: z.number().positive().max(250).optional(),
  /** Puede practicar más de una — cambia qué patrones de fuerza priorizar. */
  ridingDisciplines: z.array(z.enum(RIDING_DISCIPLINES)).default([]),
  /** Texto libre: gustos, terreno favorito, competencias, lo que no entra en un campo estructurado. */
  notes: z.string().max(500).optional(),
});

/**
 * Un renglón recortado del historial combinado (planificado + ejecutado + Garmin).
 *
 * A propósito NO es el `CombinedTrainingRecord` completo (que anida
 * `TrainingSession`/`GarminActivity` enteros): igual que `recentLogs`, sólo
 * viaja lo que la tool `get_training_history`/`get_training_record` necesita
 * para responder. Además, a diferencia de `recentLogs`, este campo nunca se
 * inyecta en el prompt — sólo se resuelve cuando el modelo invoca la tool.
 */
export const chatTrainingHistoryEntrySchema = z.object({
  kind: z.enum(["session", "freeActivity"]),
  /** Día local (America/Santiago), YYYY-MM-DD — para filtrar por rango. */
  date: z.string(),
  /** Id de la sesión planificada (`plannedSessionId`), para `get_training_record`. */
  plannedSessionId: z.string().optional(),
  plannedTitle: z.string().optional(),
  focus: z.string().optional(),
  plannedDurationMinutes: z.number().optional(),
  executionStatus: z.enum(["started", "completed", "abandoned"]).optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  actualRpe: z.number().optional(),
  painLevel: z.number().optional(),
  notes: z.string().optional(),
  garminActivityName: z.string().optional(),
  garminActivityType: z.string().optional(),
  garminDurationSeconds: z.number().optional(),
  garminAverageHeartRate: z.number().optional(),
  garminMaxHeartRate: z.number().optional(),
  garminCalories: z.number().optional(),
  garminAerobicTrainingEffect: z.number().optional(),
  garminAnaerobicTrainingEffect: z.number().optional(),
  /** Estado del vínculo con Garmin; ausente si es una actividad libre o sin vincular. */
  matchStatus: z.enum(["confirmed", "suggested", "rejected"]).optional(),
  /** "repeated" si esta ejecución nace de "repetir sesión"; ausente/"plan" si viene del plan original. */
  origin: z.enum(["plan", "repeated"]).optional(),
  /** Id de la ejecución original que se repitió, sólo presente cuando `origin` es "repeated". */
  sourceExecutionId: z.string().optional(),
});

export type ChatTrainingHistoryEntry = z.infer<typeof chatTrainingHistoryEntrySchema>;

export const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: chatRoleSchema,
      content: z.string(),
    }),
  ),
  athleteProfile: athleteProfileSchema.optional(),
  /** Historial de sesiones registradas, para preguntas de progresión. */
  recentLogs: z
    .array(
      z.object({
        sessionTitle: z.string(),
        completedAt: z.string(),
        sessionRpe: z.number().optional(),
        painLevel: z.number().optional(),
        exercises: z.array(
          z.object({
            name: z.string(),
            load: z.string().optional(),
            actualReps: z.string().optional(),
          }),
        ),
      }),
    )
    .default([]),
  /** Historial combinado (Calendario), sólo resuelto vía tool — nunca inyectado en el prompt. */
  trainingHistory: z.array(chatTrainingHistoryEntrySchema).default([]),
  /**
   * Notas subjetivas recientes ("cómo me siento"), auto-reportadas por el
   * atleta — a diferencia de `trainingHistory`, sí viajan en el prompt: son
   * pocas y cortas, y el coach las necesita para cualquier pregunta, no sólo
   * cuando las pide explícitamente.
   */
  subjectiveNotes: z.array(wellnessNoteSchema).default([]),
  activePlanId: z.string().optional(),
});

export const chatResponseSchema = z.object({
  message: chatMessageSchema,
  garminStatus: z.object({
    status: z.enum(["connected", "stale", "demo", "disconnected"]),
    dataSource: z.enum(["mock", "garmin-mcp", "agent-endpoint"]),
    lastSyncAt: z.string().optional(),
    message: z.string(),
  }),
  snapshot: garminSnapshotSchema.optional(),
});

export type ChatRole = z.infer<typeof chatRoleSchema>;
export type MetricChip = z.infer<typeof metricChipSchema>;
export type CoachAnalysis = z.infer<typeof coachAnalysisSchema>;
export type PlanProposal = z.infer<typeof planProposalSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type AthleteProfile = z.infer<typeof athleteProfileSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;

/** Sugerencias que abren el chat vacío. */
export const QUICK_PROMPTS = [
  "¿Cómo está mi recuperación hoy?",
  "¿Estoy listo para entrenar fuerte?",
  "Analiza mi última salida en bicicleta",
  "Compárame con las últimas cuatro semanas",
  "Créame un plan de entrenamiento",
  "Adapta mi sesión de hoy",
] as const;
