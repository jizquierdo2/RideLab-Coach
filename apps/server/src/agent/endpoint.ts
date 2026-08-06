import {
  chatMessageSchema,
  fallbackGuidance,
  type ChatMessage,
  type ChatRequest,
  type GarminSnapshot,
  type PerformanceAssessment,
  type PerformanceGuidance,
  type PerformanceSnapshot,
} from "@ridelab/shared";
import { newMessageId, type AgentGateway } from "./gateway";
import { config } from "../config";

/**
 * Coach delegado a un agente ya desplegado.
 *
 * ⚠️ Estado: implementado pero NO verificado (requiere `AGENT_ENDPOINT`).
 * Espera un POST que responda con un `ChatMessage` válido.
 */
export class RemoteAgentGateway implements AgentGateway {
  readonly name = "RemoteAgentGateway";

  constructor(private readonly endpoint: string = config.agentEndpoint) {
    if (!endpoint) throw new Error("AGENT_ENDPOINT es obligatorio para RemoteAgentGateway");
  }

  async reply(request: ChatRequest, snapshot: GarminSnapshot): Promise<ChatMessage> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, snapshot }),
    });

    if (!response.ok) {
      throw new Error(`El agente remoto respondió ${response.status}`);
    }

    const parsed = chatMessageSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("El agente remoto devolvió un mensaje con formato inválido");
    }

    return { ...parsed.data, id: parsed.data.id || newMessageId() };
  }

  /**
   * No hay un protocolo definido para pedirle guidance de Estado a un
   * endpoint remoto arbitrario — a diferencia de `reply()`, que sí tiene un
   * contrato fijo. Usa el mismo fallback determinístico que el resto.
   */
  async generateGuidance(assessment: PerformanceAssessment): Promise<PerformanceGuidance> {
    return fallbackGuidance(assessment);
  }
}
