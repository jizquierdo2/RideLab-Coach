import { z } from "zod";
import { trainingPlanSchema } from "./plan";
import { garminSnapshotSchema } from "./garmin";
import { wellnessNoteSchema } from "./wellness";

/**
 * Contrato del chat entre la app y el backend.
 *
 * El Coach responde como una conversación, no como un informe: `content` es
 * la respuesta completa en prosa natural. `dataSources`/`suggestedActions`/
 * `followUpQuestion` son metadata liviana para la UI (qué datos se usaron,
 * qué acciones ofrecer, si quedó una pregunta pendiente) — nunca campos que
 * fragmenten la respuesta en secciones visuales separadas.
 */

export const chatRoleSchema = z.enum(["user", "assistant", "system"]);

/**
 * Referencia a un dato que el Coach realmente usó para responder — se
 * calcula en el backend a partir de qué tools se llamaron ese turno, nunca
 * se le confía al modelo qué dice haber usado. Alimenta "Ver datos
 * utilizados"; las métricas completas siguen viviendo en Estado.
 */
export const chatDataSourceSchema = z.object({
  type: z.enum(["garmin", "training_session", "user_feedback", "training_history"]),
  label: z.string().min(1),
  /** Valor corto ya formateado para mostrar en el detalle, ej. "67 min 57 s" o "RPE 1/10". */
  detail: z.string().optional(),
});

export type ChatDataSource = z.infer<typeof chatDataSourceSchema>;

/** Acción contextual bajo la respuesta — máximo 3 por mensaje, sólo si son relevantes. */
export const suggestedActionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  action: z.enum([
    "adjust_next_session",
    "open_session",
    "compare_session",
    "show_used_data",
    "open_status",
  ]),
  /** Sesión/plan al que apunta la acción, cuando aplica (open_session/adjust_next_session/compare_session). */
  targetId: z.string().optional(),
});

export type SuggestedAction = z.infer<typeof suggestedActionSchema>;

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
  dataSources: z.array(chatDataSourceSchema).default([]),
  suggestedActions: z.array(suggestedActionSchema).default([]),
  /** Si el Coach terminó con una pregunta, queda acá también (además de al final de `content`) para que el próximo turno pueda usarla como contexto. */
  followUpQuestion: z.string().optional(),
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
