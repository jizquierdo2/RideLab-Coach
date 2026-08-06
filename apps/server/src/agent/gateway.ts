import type {
  ChatRequest,
  ChatMessage,
  GarminSnapshot,
  PerformanceAssessment,
  PerformanceGuidance,
  PerformanceSnapshot,
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
   */
  reply(request: ChatRequest, snapshot: GarminSnapshot): Promise<ChatMessage>;

  /**
   * Mensaje breve del coach para la sección Estado, a partir de un
   * `PerformanceAssessment` ya calculado — el agente nunca decide el nivel,
   * sólo redacta sobre lo que el motor determinístico ya resolvió.
   */
  generateGuidance(assessment: PerformanceAssessment, snapshot: PerformanceSnapshot): Promise<PerformanceGuidance>;
}

export function newMessageId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
