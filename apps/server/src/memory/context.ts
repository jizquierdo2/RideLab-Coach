import { config } from "../config";
import { DEFAULT_USER_ID, type MemoryRepository } from "./repository";

/**
 * Compacta lo que el Coach debe recordar entre sesiones en un texto listo
 * para inyectar como system message adicional en `OpenAIAgentGateway.reply()`
 * — separado de `COACH_BASE_INSTRUCTIONS`/`buildContext()` porque esto viene
 * de la base de memoria, no de lo que la app reenvía en la petición.
 *
 * `embedQuery` es opcional (inyección de dependencia, mismo patrón que
 * `historicalMetrics` en `OpenAIAgentGateway`): hasta que exista `embedText()`
 * (Fase 7), la búsqueda semántica sobre fragmentos simplemente se omite — el
 * contexto sigue siendo útil con sólo los últimos 7 días y el resumen
 * vigente.
 */
export async function buildMemoryContext(
  repository: MemoryRepository,
  currentMessageText: string,
  options: {
    userId?: string;
    now?: Date;
    embedQuery?: (text: string) => Promise<number[]>;
  } = {},
): Promise<string | undefined> {
  const userId = options.userId ?? DEFAULT_USER_ID;
  const now = options.now ?? new Date();
  const sinceIso = new Date(now.getTime() - config.memory.activeWindowDays * 24 * 60 * 60 * 1000).toISOString();

  const recentMessages = repository.listRecentMessages(userId, sinceIso);
  const latestSummary = repository.getLatestSummary(userId);

  let relevantFragments: string[] = [];
  if (options.embedQuery && currentMessageText.trim()) {
    try {
      const queryEmbedding = await options.embedQuery(currentMessageText);
      relevantFragments = repository.searchFragments(userId, queryEmbedding, 5).map((f) => f.text);
    } catch (error) {
      console.warn("[memory] búsqueda semántica falló, se sigue sin fragmentos:", error instanceof Error ? error.message : error);
    }
  }

  const sections = [
    latestSummary
      ? `Resumen de lo que sabes de este atleta de conversaciones anteriores (metas, preferencias, limitaciones, cargas, decisiones acordadas — los datos más recientes de la conversación actual siempre tienen prioridad sobre esto si hay contradicción):\n${latestSummary.summary}`
      : "",
    relevantFragments.length
      ? `Fragmentos de conversaciones pasadas relacionados con lo que el usuario pregunta ahora:\n${relevantFragments.map((f) => `- ${f}`).join("\n")}`
      : "",
    recentMessages.length
      ? `Conversación de los últimos ${config.memory.activeWindowDays} días (más antigua a más reciente, puede incluir otras sesiones de chat):\n${recentMessages
          .map((m) => `${m.role === "user" ? "Usuario" : "Coach"}: ${m.content}`)
          .join("\n")}`
      : "",
  ].filter(Boolean);

  if (!sections.length) return undefined;

  return [
    "MEMORIA DEL COACH — contexto de conversaciones anteriores con este atleta, no de la petición actual:",
    ...sections,
  ].join("\n\n");
}
