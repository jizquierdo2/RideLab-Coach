import type {
  ChatRequest,
  ChatMessage,
  GarminSnapshot,
  PerformanceAssessment,
  PerformanceGuidance,
  PerformanceSnapshot,
  StructuredMemory,
} from "@ridelab/shared";

/**
 * Contrato del agente.
 *
 * La ruta HTTP sólo conoce esta interfaz: el coach puede ser el simulado, el de
 * OpenAI o un endpoint ya desplegado sin que cambie nada aguas arriba.
 */
export interface AgentGateway {
  readonly name: string;

  /**
   * Responde un turno de conversación.
   *
   * @param request historial, perfil del atleta y registros recientes
   * @param snapshot métricas Garmin ya resueltas por el `GarminDataProvider`
   * @param memoryContext memoria persistente entre sesiones (resumen vigente +
   * últimos días + fragmentos relevantes), ya compactada por
   * `memory/context.ts#buildMemoryContext`. `undefined` si la memoria está
   * deshabilitada (sin `MEMORY_ENCRYPTION_KEY`) o no hay nada que recordar
   * todavía.
   */
  reply(request: ChatRequest, snapshot: GarminSnapshot, memoryContext?: string): Promise<ChatMessage>;

  /**
   * Mensaje breve del coach para la sección Estado, a partir de un
   * `PerformanceAssessment` ya calculado — el agente nunca decide el nivel,
   * sólo redacta sobre lo que el motor determinístico ya resolvió.
   *
   * @param subjectiveNote nota subjetiva del día ("cómo me siento"), si el
   * atleta la registró — contexto adicional, nunca cambia el nivel calculado.
   */
  generateGuidance(
    assessment: PerformanceAssessment,
    snapshot: PerformanceSnapshot,
    subjectiveNote?: string,
  ): Promise<PerformanceGuidance>;

  /**
   * Actualiza la memoria estructurada del atleta a partir de mensajes que ya
   * salieron de la ventana activa de 7 días — memoria persistente, Fase 7.
   * Opcional: sólo `OpenAIAgentGateway` la implementa (sin un modelo real no
   * hay con qué resumir); `memory/summarizer.ts` no hace nada si el gateway
   * activo no la ofrece (ej. en modo demo).
   */
  summarizeMemory?(
    previousSummary: StructuredMemory,
    newMessages: Array<{ role: "user" | "assistant"; content: string }>,
  ): Promise<StructuredMemory>;
}

export function newMessageId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
