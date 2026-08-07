import { Platform } from "react-native";
import Constants from "expo-constants";
import type {
  CatalogExercise,
  ChatRequest,
  ChatResponse,
  GarminActivity,
  GarminStatus,
  PerformanceResponse,
} from "@ridelab/shared";

/** Puerto donde escucha el backend. */
const BACKEND_PORT = 8787;

/**
 * Cliente del backend.
 *
 * La app NUNCA guarda claves de OpenAI, tokens de Garmin ni credenciales MCP:
 * lo único que conoce es esta URL. Todos los secretos viven en el backend.
 */

/**
 * Resuelve dónde vive el backend.
 *
 * El orden importa: se prefiere deducir el host desde donde se está sirviendo la
 * app, porque así el mismo bundle funciona en el navegador (localhost) y en un
 * teléfono físico (IP de la red local) sin configurar nada. Una IP fija en
 * `EXPO_PUBLIC_API_URL` rompería uno de los dos casos.
 */
function resolveBaseUrl(): string {
  // 1) En web, el backend está en el mismo host desde el que se sirvió la app.
  //    Cubre tanto localhost como una IP de red.
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`;
  }

  // 2) URL explícita, para cuando el backend no está en la misma máquina que Metro.
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  // 3) `extra.apiBaseUrl` de app.json.
  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  if (fromExtra) return fromExtra.replace(/\/$/, "");

  // 4) En un dispositivo, el host que sirve Metro es el computador donde corre
  //    el backend. Evita tener que escribir la IP a mano.
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  if (hostUri) return `http://${hostUri.split(":")[0]}:${BACKEND_PORT}`;

  return `http://localhost:${BACKEND_PORT}`;
}

export const API_BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: "offline" | "server" | "invalid" | "timeout",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Cuánto se espera antes de rendirse, por tipo de petición.
 *
 * El chat necesita mucho más margen que el resto: armar un plan completo puede
 * tomar más de un minuto porque el modelo redacta el análisis y el plan en la
 * misma respuesta. Sin un límite propio, quien cortaba era el sistema operativo
 * y el error resultante decía "no se pudo conectar", culpando al backend por
 * algo que era una espera larga.
 */
const TIMEOUT_MS = {
  chat: 150_000,
  default: 45_000,
} as const;

async function request<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number; signal?: AbortSignal },
): Promise<T> {
  const { timeoutMs = TIMEOUT_MS.default, signal: callerSignal, ...rest } = init ?? {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Si quien llama trae su propio signal (botón de cancelar), cancelar por ahí
  // también aborta la petición.
  const onCallerAbort = () => controller.abort();
  callerSignal?.addEventListener("abort", onCallerAbort);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    // `AbortError` no distingue timeout de cancelación del usuario: el estado
    // del controller sí, y el mensaje tiene que decir cuál de las dos fue.
    if (callerSignal?.aborted) {
      throw new ApiError("Cancelaste la consulta.", "timeout");
    }
    if (controller.signal.aborted) {
      throw new ApiError(
        `El coach tardó más de ${Math.round(timeoutMs / 1000)} segundos en responder. Vuelve a intentarlo; si pediste un plan completo, pídelo en partes.`,
        "timeout",
      );
    }
    throw new ApiError(
      `No se pudo conectar con el coach en ${API_BASE_URL}. Revisa tu conexión.`,
      "offline",
    );
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }

  if (!response.ok) {
    // El backend devuelve errores como JSON `{error, details?}` (ver /api/chat,
    // /api/garmin/connect). Si el body es ese JSON, mostramos el mensaje real
    // en vez de un texto crudo poco legible.
    const raw = await response.text().catch(() => "");
    let message = raw.slice(0, 160);
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // No era JSON: se usa el texto crudo tal cual.
    }
    throw new ApiError(
      message ? `${message}` : `El coach respondió ${response.status}`,
      "server",
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError("El coach devolvió una respuesta ilegible", "invalid");
  }
}

export const api = {
  /** @param signal permite cancelar desde la UI mientras el coach piensa. */
  sendChat: (payload: ChatRequest, signal?: AbortSignal) =>
    request<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: TIMEOUT_MS.chat,
      signal,
    }),

  getGarminStatus: () => request<GarminStatus>("/api/garmin/status"),

  getCatalog: () => request<{ exercises: CatalogExercise[] }>("/api/catalog"),

  getHealth: () =>
    request<{
      ok: boolean;
      mockMode: boolean;
      garminProvider: string;
      agentGateway: string;
      blockers: string[];
    }>("/api/health"),

  /**
   * Envía el usuario/contraseña de Garmin al backend UNA vez para conectar.
   * La app nunca los guarda: ni en AsyncStorage, ni en ningún otro lado.
   */
  connectGarmin: (email: string, password: string) =>
    request<{ connected: true }>("/api/garmin/connect", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  disconnectGarmin: () =>
    request<{ connected: false }>("/api/garmin/disconnect", { method: "POST" }),

  /** @param todayNote nota subjetiva del día ("cómo me siento"), si existe — contexto extra para el mensaje del coach. */
  getPerformance: (todayNote?: string) =>
    request<PerformanceResponse>(
      `/api/garmin/performance${todayNote ? `?note=${encodeURIComponent(todayNote)}` : ""}`,
    ),

  getGarminActivities: (startDate: string, endDate: string) =>
    request<{ activities: GarminActivity[] }>(
      `/api/garmin/activities?startDate=${startDate}&endDate=${endDate}`,
    ),
};
