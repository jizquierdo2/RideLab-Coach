import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { GarminActivity, GarminSnapshot } from "@ridelab/shared";
import { assertReadOnlyTool, GARMIN_READ_ONLY_TOOLS, type GarminDataProvider } from "./provider";
import { config } from "../config";

/** Versión fijada del paquete, la misma ya verificada funcionando fuera de este proyecto. */
const MCP_PACKAGE = "@nicolasvegam/garmin-connect-mcp@1.1.1";

/**
 * Proveedor que lee métricas de Garmin lanzando `@nicolasvegam/garmin-connect-mcp`
 * como proceso hijo por stdio (el paquete no soporta HTTP).
 *
 * El login del paquete es perezoso: el proceso arranca aunque las credenciales
 * sean inválidas, y sólo falla en la primera tool real. `verifyLogin()` fuerza
 * eso ahora mismo, para poder confirmar éxito/fracaso desde
 * `POST /api/garmin/connect` en vez de descubrirlo en una respuesta del coach.
 *
 * Sólo invoca herramientas de la allowlist de lectura: nunca escribe en la
 * cuenta de Garmin del usuario.
 */
export class McpGarminDataProvider implements GarminDataProvider {
  readonly name = "McpGarminDataProvider";

  private client: Client | undefined;
  private transport: StdioClientTransport | undefined;
  private connectPromise: Promise<Client> | undefined;

  constructor(
    private readonly email: string = config.garmin.email,
    private readonly password: string = config.garmin.password,
  ) {}

  async isReady(): Promise<boolean> {
    if (!this.email || !this.password) return false;
    try {
      await this.connect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fuerza el login perezoso del paquete ahora, llamando una tool real de la
   * allowlist. `getSnapshot()` no la usa — sigue igual que antes, tragándose
   * fallos por métrica en vez de exponerlos.
   */
  async verifyLogin(): Promise<{ ok: true } | { ok: false; message: string }> {
    assertReadOnlyTool("get_daily_summary");
    try {
      const client = await this.connect();
      const result = await client.callTool({ name: "get_daily_summary", arguments: {} });
      if ((result as { isError?: boolean }).isError) {
        console.warn("[garmin-mcp] verifyLogin: get_daily_summary respondió isError=true");
        return { ok: false, message: loginFailedMessage() };
      }
      return { ok: true };
    } catch (error) {
      // El mensaje que ve el usuario es siempre el mismo (genérico, por la
      // limitación real del paquete con MFA) — pero acá SÍ se registra la
      // causa real, porque un fallo de infraestructura (timeout, npx sin red,
      // proceso hijo que no pudo iniciar) se ve idéntico desde afuera y sin
      // este log sería indiagnosticable en un entorno como Railway.
      console.error(
        "[garmin-mcp] verifyLogin falló:",
        error instanceof Error ? error.message : error,
      );
      return { ok: false, message: loginFailedMessage() };
    }
  }

  /** Cierra el transporte (mata el proceso hijo). Idempotente. */
  async disconnect(): Promise<void> {
    try {
      await this.transport?.close();
    } finally {
      this.client = undefined;
      this.transport = undefined;
    }
  }

  /** Abre (y reutiliza) la conexión con el proceso del MCP. Deduplica llamadas concurrentes. */
  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    if (this.connectPromise) return this.connectPromise;
    if (!this.email || !this.password) {
      throw new Error("GARMIN_EMAIL / GARMIN_PASSWORD no están configuradas");
    }

    this.connectPromise = (async () => {
      // Env mínimo y explícito: nunca se pasa el process.env completo, para
      // que secretos propios del backend (OPENAI_API_KEY, etc.) no lleguen a
      // un proceso hijo que ejecuta código de un paquete de terceros.
      const transport = new StdioClientTransport({
        command: "npx",
        args: ["-y", MCP_PACKAGE],
        env: {
          PATH: process.env.PATH ?? "",
          HOME: process.env.HOME ?? "",
          GARMIN_EMAIL: this.email,
          GARMIN_PASSWORD: this.password,
        },
      });

      const client = new Client(
        { name: "ridelab-coach-backend", version: "0.1.0" },
        { capabilities: {} },
      );

      await client.connect(transport);
      this.client = client;
      this.transport = transport;
      return client;
    })();

    try {
      return await this.connectPromise;
    } finally {
      this.connectPromise = undefined;
    }
  }

  /**
   * Invoca una tool del MCP, verificando primero que sea de sólo lectura.
   * Devuelve `undefined` si falla, para que la métrica quede como no disponible
   * en vez de romper toda la respuesta.
   */
  private async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T | undefined> {
    assertReadOnlyTool(name);
    try {
      const client = await this.connect();
      const result = await client.callTool({ name, arguments: args });
      const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
      const text = content
        .filter((part) => part.type === "text" && part.text)
        .map((part) => part.text)
        .join("");
      if (!text) return undefined;
      // Un error de MCP llega como texto plano ("MCP error -32602: ..."), no
      // como JSON — intentar JSON.parse sobre eso oculta el mensaje real.
      if ((result as { isError?: boolean }).isError) {
        console.warn(`[garmin-mcp] "${name}" respondió error:`, text.slice(0, 200));
        return undefined;
      }
      return JSON.parse(text) as T;
    } catch (error) {
      console.warn(`[garmin-mcp] "${name}" falló:`, error instanceof Error ? error.message : error);
      return undefined;
    }
  }

  async getSnapshot(days = 28): Promise<GarminSnapshot> {
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

    const [sleep, hrv, readiness, status, bodyBattery, stress, vo2max, activities] =
      await Promise.all([
        this.callTool<Record<string, unknown>>("get_sleep_data", { date: today }),
        this.callTool<Record<string, unknown>>("get_hrv", { date: today }),
        this.callTool<Record<string, unknown>>("get_training_readiness", { date: today }),
        this.callTool<Record<string, unknown>>("get_training_status", { date: today }),
        // Esta tool pide startDate/endDate, no date — a diferencia de casi
        // todas las demás. Verificado contra el servidor real.
        this.callTool<Array<Record<string, unknown>>>("get_body_battery", {
          startDate: today,
          endDate: today,
        }),
        this.callTool<Record<string, unknown>>("get_stress", { date: today }),
        this.callTool<Record<string, unknown>>("get_vo2max", {}),
        this.callTool<Array<Record<string, unknown>>>("get_activities", { limit: 5 }),
      ]);

    const unavailableMetrics: string[] = [];
    const track = (value: unknown, label: string) => {
      if (value === undefined || value === null) unavailableMetrics.push(label);
      return value;
    };

    track(sleep, "Sueño");
    track(hrv, "HRV");
    track(readiness, "Training Readiness");
    track(status, "Estado de entrenamiento");
    track(bodyBattery, "Body Battery");
    track(stress, "Estrés");
    track(vo2max, "VO₂ Max");
    track(activities, "Actividades recientes");

    const first = <T>(value: unknown): T | undefined =>
      Array.isArray(value) ? (value[0] as T | undefined) : (value as T | undefined);

    const num = (value: unknown): number | undefined =>
      typeof value === "number" && Number.isFinite(value) ? value : undefined;

    const readinessRow = first<Record<string, unknown>>(readiness);

    // get_sleep_data: los datos reales están bajo dailySleepDTO, no en la raíz.
    // sleepScores.overall es {value, qualifierKey}, no un número.
    const dailySleep = sleep?.dailySleepDTO as Record<string, unknown> | undefined;
    const sleepScores = dailySleep?.sleepScores as Record<string, unknown> | undefined;
    const sleepOverall = sleepScores?.overall as Record<string, unknown> | undefined;

    // get_hrv: los datos vienen anidados en hrvSummary, no en el objeto raíz.
    const hrvSummary = hrv?.hrvSummary as Record<string, unknown> | undefined;
    const hrvBaseline = hrvSummary?.baseline as Record<string, unknown> | undefined;
    const hrvStatusRaw = typeof hrvSummary?.status === "string" ? hrvSummary.status.toLowerCase() : undefined;
    const hrvStatus: GarminSnapshot["hrv"] extends undefined
      ? never
      : "balanced" | "unbalanced" | "low" | "poor" | "unknown" =
      hrvStatusRaw === "balanced" || hrvStatusRaw === "unbalanced" || hrvStatusRaw === "low" || hrvStatusRaw === "poor"
        ? hrvStatusRaw
        : "unknown";
    const baselineLow = num(hrvBaseline?.balancedLow);
    const baselineHigh = num(hrvBaseline?.balancedUpper);
    const lastNightAvg = num(hrvSummary?.lastNightAvg);
    const vsBaselinePercent =
      lastNightAvg !== undefined && baselineLow !== undefined && baselineHigh !== undefined
        ? Math.round(((lastNightAvg - (baselineLow + baselineHigh) / 2) / ((baselineLow + baselineHigh) / 2)) * 100)
        : undefined;

    // get_body_battery: devuelve un array; el nivel "actual" está en el último
    // punto de bodyBatteryValuesArray ([timestamp, nivel]), no en "charged"
    // (que es cuánto se cargó en el día, un dato distinto).
    const bbRow = first<Record<string, unknown>>(bodyBattery);
    const bbSeries = bbRow?.bodyBatteryValuesArray as Array<[number, number]> | undefined;
    const bbLevels = Array.isArray(bbSeries) ? bbSeries.map(([, level]) => level).filter((l) => typeof l === "number") : [];

    // get_training_status: la forma real está anidada varios niveles bajo un
    // objeto por dispositivo, con clave dinámica (el id del reloj).
    const latestByDevice = (
      (status?.mostRecentTrainingStatus as Record<string, unknown> | undefined)?.latestTrainingStatusData as
        | Record<string, Record<string, unknown>>
        | undefined
    ) ?? {};
    const trainingStatusRow = Object.values(latestByDevice)[0];
    const acuteLoadDto = trainingStatusRow?.acuteTrainingLoadDTO as Record<string, unknown> | undefined;

    return {
      dataSource: "garmin-mcp",
      period: `${from} a ${today} (${days} días)`,
      lastSyncAt: new Date().toISOString(),
      connected: true,
      sleep: dailySleep
        ? {
            date: today,
            durationMinutes: num(dailySleep.sleepTimeSeconds)
              ? Math.round((dailySleep.sleepTimeSeconds as number) / 60)
              : undefined,
            score: num(sleepOverall?.value),
            deepMinutes: num(dailySleep.deepSleepSeconds)
              ? Math.round((dailySleep.deepSleepSeconds as number) / 60)
              : undefined,
            remMinutes: num(dailySleep.remSleepSeconds)
              ? Math.round((dailySleep.remSleepSeconds as number) / 60)
              : undefined,
            lightMinutes: num(dailySleep.lightSleepSeconds)
              ? Math.round((dailySleep.lightSleepSeconds as number) / 60)
              : undefined,
            awakeMinutes: num(dailySleep.awakeSleepSeconds)
              ? Math.round((dailySleep.awakeSleepSeconds as number) / 60)
              : undefined,
          }
        : undefined,
      hrv: hrvSummary
        ? {
            date: today,
            lastNightAvgMs: lastNightAvg,
            weeklyAvgMs: num(hrvSummary.weeklyAvg),
            baselineLowMs: baselineLow,
            baselineHighMs: baselineHigh,
            status: hrvStatus,
            vsBaselinePercent,
          }
        : undefined,
      bodyBattery: bbRow
        ? {
            date: today,
            current: bbLevels.length ? bbLevels[bbLevels.length - 1] : undefined,
            highest: bbLevels.length ? Math.max(...bbLevels) : undefined,
            lowest: bbLevels.length ? Math.min(...bbLevels) : undefined,
            charged: num(bbRow.charged),
            drained: num(bbRow.drained),
          }
        : undefined,
      stress: stress ? { date: today, avgLevel: num(stress.avgStressLevel) } : undefined,
      trainingReadiness: readinessRow
        ? {
            date: today,
            score: num(readinessRow.score),
            level: (readinessRow.level as GarminSnapshot["trainingReadiness"] extends undefined
              ? never
              : "LOW" | "MODERATE" | "HIGH" | "MAXIMUM" | "UNKNOWN") ?? "UNKNOWN",
            sleepScore: num(readinessRow.sleepScore),
            recoveryTimeHours: num(readinessRow.recoveryTime),
            acuteLoad: num(readinessRow.acuteLoad),
            hrvFactorPercent: num(readinessRow.hrvFactorPercent),
          }
        : undefined,
      trainingStatus: trainingStatusRow
        ? {
            date: today,
            status: String(trainingStatusRow.trainingStatusFeedbackPhrase ?? ""),
            acwr: num(acuteLoadDto?.acwrPercent),
            weeklyLoad: num(trainingStatusRow.weeklyTrainingLoad),
          }
        : undefined,
      vo2max: num(first<Record<string, unknown>>(vo2max)?.vo2MaxValue),
      recentActivities: Array.isArray(activities)
        ? activities.slice(0, 5).map((activity, index) => ({
            id: String(activity.activityId ?? `mcp-${index}`),
            name: String(activity.activityName ?? "Actividad"),
            type: String(
              (activity.activityType as Record<string, unknown> | undefined)?.typeKey ?? "unknown",
            ),
            startTimeLocal: String(activity.startTimeLocal ?? ""),
            durationSeconds: num(activity.duration),
            distanceMeters: num(activity.distance),
            elevationGainMeters: num(activity.elevationGain),
            averageHr: num(activity.averageHR),
            maxHr: num(activity.maxHR),
            averagePowerWatts: num(activity.avgPower),
            calories: num(activity.calories),
          }))
        : [],
      weeklyTrends: [],
      unavailableMetrics,
    };
  }

  /**
   * Actividades Garmin del rango pedido, para el calendario y el matcher.
   *
   * `get_activities` no confirmó soportar `startDate`/`endDate` en las pruebas
   * contra la cuenta real (sólo se verificó con `limit`) — se pide un lote
   * generoso y se filtra el rango en el cliente, en vez de asumir un parámetro
   * no verificado. Los campos de Training Effect (`aerobicTrainingEffect`/
   * `anaerobicTrainingEffect`) usan los nombres estándar de la API de Garmin
   * Connect, pero no se confirmaron contra una respuesta real de este MCP —
   * si no vienen, quedan `undefined` (el schema ya los declara opcionales).
   */
  async getActivities({ startDate, endDate }: { startDate: string; endDate: string }): Promise<GarminActivity[]> {
    const raw = await this.callTool<Array<Record<string, unknown>>>("get_activities", { limit: 50 });
    if (!Array.isArray(raw)) return [];

    const num = (value: unknown): number | undefined =>
      typeof value === "number" && Number.isFinite(value) ? value : undefined;

    return raw
      .map((activity, index): GarminActivity => ({
        id: String(activity.activityId ?? `mcp-${index}`),
        name: String(activity.activityName ?? "Actividad"),
        activityType: String(
          (activity.activityType as Record<string, unknown> | undefined)?.typeKey ?? "unknown",
        ),
        startedAt: String(activity.startTimeGMT ?? activity.startTimeLocal ?? ""),
        durationSeconds: num(activity.duration) ?? 0,
        calories: num(activity.calories),
        averageHeartRate: num(activity.averageHR),
        maxHeartRate: num(activity.maxHR),
        aerobicTrainingEffect: num(activity.aerobicTrainingEffect),
        anaerobicTrainingEffect: num(activity.anaerobicTrainingEffect),
        distanceMeters: num(activity.distance),
        elevationGainMeters: num(activity.elevationGain),
        syncedAt: new Date().toISOString(),
      }))
      .filter((activity) => {
        const day = activity.startedAt.slice(0, 10);
        return day >= startDate && day <= endDate;
      });
  }

  /** Herramientas que este proveedor tiene permitido usar. */
  static get allowedTools(): readonly string[] {
    return GARMIN_READ_ONLY_TOOLS;
  }
}

/**
 * El paquete no distingue contraseña incorrecta de verificación en dos pasos
 * (MFA) — ambos casos tiran el mismo error genérico. No hay forma de separar
 * los casos sin cambiar de paquete, así que el mensaje es honesto sobre eso.
 */
function loginFailedMessage(): string {
  return (
    "No se pudo iniciar sesión en Garmin Connect. Revisa tu usuario y contraseña. " +
    "Si tu cuenta tiene verificación en dos pasos (MFA), este método de conexión no puede completarla."
  );
}
