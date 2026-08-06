import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

/** Mismo HOME que usa `McpGarminDataProvider` al lanzar el proceso hijo del MCP. */
function mcpHome(): string {
  return process.env.HOME ?? "";
}

/**
 * Siembra `~/.garmin-mcp/*.json` desde variables de entorno, antes de que el
 * proceso hijo del MCP intente autenticarse.
 *
 * Por qué existe: un login NUEVO (usuario/clave) contra Garmin quedó
 * verificado como limitado desde la IP de ciertos hosts — el mismo login
 * funciona al toque desde otra red. Una sesión ya autenticada no pasa por ese
 * mismo camino, así que sembrar tokens válidos evita el problema por completo
 * en vez de reintentar contra un endpoint que la IP tiene bloqueado.
 *
 * No pisa un archivo que ya exista: si el proceso ya refrescó el token con uno
 * más nuevo, sembrar el valor original de la variable de entorno lo
 * retrocedería.
 */
export function seedGarminTokenCacheFromEnv(): void {
  const { oauth1TokenB64, oauth2TokenB64, profileB64 } = config.garmin;
  if (!oauth1TokenB64 && !oauth2TokenB64 && !profileB64) return;

  const cacheDir = path.join(mcpHome(), ".garmin-mcp");
  fs.mkdirSync(cacheDir, { recursive: true });

  writeIfMissing(cacheDir, "oauth1_token.json", oauth1TokenB64);
  writeIfMissing(cacheDir, "oauth2_token.json", oauth2TokenB64);
  writeIfMissing(cacheDir, "profile.json", profileB64);
}

function writeIfMissing(cacheDir: string, filename: string, base64Value: string): void {
  if (!base64Value) return;
  const target = path.join(cacheDir, filename);
  if (fs.existsSync(target)) return;
  fs.writeFileSync(target, Buffer.from(base64Value, "base64"));
  console.log(`[garmin-mcp] sembrado ${filename} desde variable de entorno`);
}
