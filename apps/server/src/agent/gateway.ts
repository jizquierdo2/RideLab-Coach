import type { ChatRequest, ChatMessage, GarminSnapshot } from "@ridelab/shared";

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
}

export function newMessageId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
