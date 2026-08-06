import "dotenv/config";

/**
 * Configuración del backend.
 *
 * Todos los secretos viven aquí y NUNCA se envían a la app móvil. La app sólo
 * conoce la URL de este backend.
 */

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true" || value === "1";
}

export const config = {
  port: Number(process.env.PORT ?? 8787),

  /**
   * Con `MOCK_MODE=true` el backend responde con el coach simulado y el snapshot
   * demo, sin llamar a OpenAI ni a Garmin. Es el modo por defecto: así la app
   * funciona completa sin ninguna credencial.
   */
  mockMode: bool(process.env.MOCK_MODE, true),

  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    model: process.env.OPENAI_MODEL ?? "gpt-4o",
  },

  garmin: {
    /**
     * Credenciales de Garmin Connect. Normalmente no se completan a mano: se
     * escriben solas en `.env` tras un login exitoso desde la pantalla de
     * conexión en la app (`POST /api/garmin/connect`).
     */
    email: process.env.GARMIN_EMAIL ?? "",
    password: process.env.GARMIN_PASSWORD ?? "",

    /**
     * Tokens OAuth de Garmin ya autenticados, en base64, opcionales.
     *
     * Un login NUEVO (usuario/clave) puede quedar limitado por Garmin desde
     * la IP de ciertos hosts (verificado: el mismo login funciona al toque
     * desde otra red) — pero una sesión ya autenticada no tiene ese problema.
     * Si están presentes, se siembran en `~/.garmin-mcp/*.json` al arrancar
     * para que el proceso del MCP nunca tenga que pisar el login bloqueado.
     * Se generan localmente desde una red que sí puede loguearse; ver
     * `garmin/token-seed.ts`.
     */
    oauth1TokenB64: process.env.GARMIN_OAUTH1_TOKEN_B64 ?? "",
    oauth2TokenB64: process.env.GARMIN_OAUTH2_TOKEN_B64 ?? "",
    profileB64: process.env.GARMIN_PROFILE_B64 ?? "",
  },

  /** Endpoint de un agente ya desplegado, si existe. Alternativa al par OpenAI + MCP. */
  agentEndpoint: process.env.AGENT_ENDPOINT ?? "",
} as const;

export type AppConfig = typeof config;

/** Razones por las que el backend no puede usar datos reales todavía. */
export function describeRealDataBlockers(cfg: AppConfig = config): string[] {
  const blockers: string[] = [];
  if (cfg.mockMode) blockers.push("MOCK_MODE=true");
  if (!cfg.openai.apiKey && !cfg.agentEndpoint) {
    blockers.push("falta OPENAI_API_KEY o AGENT_ENDPOINT");
  }
  if ((!cfg.garmin.email || !cfg.garmin.password) && !cfg.agentEndpoint) {
    blockers.push("Garmin no conectado (conecta desde la app o define GARMIN_EMAIL/GARMIN_PASSWORD)");
  }
  return blockers;
}
