import { config, describeRealDataBlockers } from "./config";
import type { GarminDataProvider } from "./garmin/provider";
import { MockGarminDataProvider } from "./garmin/mock";
import { McpGarminDataProvider } from "./garmin/mcp";
import type { AgentGateway } from "./agent/gateway";
import { MockAgentGateway } from "./agent/mock";
import { OpenAIAgentGateway } from "./agent/openai";
import { RemoteAgentGateway } from "./agent/endpoint";

/**
 * Elige las implementaciones según la configuración.
 *
 * La regla es conservadora: si falta cualquier credencial, se cae a la variante
 * simulada. Nunca se intenta pasar por real algo que no lo es.
 */

export function createGarminProvider(): GarminDataProvider {
  if (config.mockMode || !config.garmin.email || !config.garmin.password) {
    return new MockGarminDataProvider();
  }
  return new McpGarminDataProvider();
}

export function createAgentGateway(): AgentGateway {
  if (config.mockMode) return new MockAgentGateway();
  if (config.agentEndpoint) return new RemoteAgentGateway();
  if (config.openai.apiKey) return new OpenAIAgentGateway();
  return new MockAgentGateway();
}

export interface RuntimeInfo {
  mockMode: boolean;
  garminProvider: string;
  agentGateway: string;
  /** Motivos por los que no se están usando datos reales. Vacío = todo real. */
  blockers: string[];
}

export function describeRuntime(
  provider: GarminDataProvider = createGarminProvider(),
  gateway: AgentGateway = createAgentGateway(),
): RuntimeInfo {
  return {
    mockMode: config.mockMode,
    garminProvider: provider.name,
    agentGateway: gateway.name,
    blockers: describeRealDataBlockers(),
  };
}
