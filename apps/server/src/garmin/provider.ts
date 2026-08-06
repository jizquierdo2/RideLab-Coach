import type { GarminActivity, GarminSnapshot, PerformanceSnapshot } from "@ridelab/shared";

/**
 * Contrato para obtener métricas de Garmin.
 *
 * La capa de agente sólo conoce esta interfaz, así que cambiar de datos demo a
 * datos reales es cambiar la implementación que se inyecta, sin tocar el resto.
 */
export interface GarminDataProvider {
  /** Identificador legible para logs y diagnósticos. */
  readonly name: string;

  /**
   * Devuelve el snapshot de métricas del periodo pedido.
   *
   * @param days ventana en días hacia atrás desde hoy
   */
  getSnapshot(days?: number): Promise<GarminSnapshot>;

  /** Comprueba si el proveedor puede entregar datos reales ahora mismo. */
  isReady(): Promise<boolean>;

  /** Actividades Garmin del rango pedido, para el calendario y el matcher. */
  getActivities(params: { startDate: string; endDate: string }): Promise<GarminActivity[]>;

  /** Snapshot de rendimiento para la sección Estado — deriva de `getSnapshot()`. */
  getPerformanceSnapshot(): Promise<PerformanceSnapshot>;
}

/**
 * Herramientas de SÓLO LECTURA que el backend puede invocar en el MCP de Garmin.
 *
 * Es una allowlist explícita, no una denylist: cualquier tool que no esté acá
 * queda fuera del alcance, incluidas todas las de escritura del servidor MCP
 * (`set_activity_name`, `add_weigh_in`, `delete_activity`, `set_hydration`,
 * `create_manual_activity`, `set_blood_pressure`, `add_gear_to_activity`,
 * `remove_gear_from_activity`).
 */
export const GARMIN_READ_ONLY_TOOLS = [
  "get_sleep_data",
  "get_hrv",
  "get_resting_heart_rate",
  "get_body_battery",
  "get_stress",
  "get_training_readiness",
  "get_training_status",
  "get_vo2max",
  "get_fitness_age",
  "get_daily_summary",
  "get_activities",
  "get_activity",
  "get_activity_hr_zones",
  "get_sleep_data_range",
  "get_hrv_range",
  "get_stress_range",
  "get_daily_steps_range",
] as const;

export type GarminReadOnlyTool = (typeof GARMIN_READ_ONLY_TOOLS)[number];

const READ_ONLY_SET: ReadonlySet<string> = new Set(GARMIN_READ_ONLY_TOOLS);

/** Guard usado antes de cualquier llamada al MCP. */
export function assertReadOnlyTool(toolName: string): asserts toolName is GarminReadOnlyTool {
  if (!READ_ONLY_SET.has(toolName)) {
    throw new Error(
      `Tool "${toolName}" no está en la allowlist de sólo lectura de Garmin. El backend no puede escribir en la cuenta del usuario.`,
    );
  }
}

export function isReadOnlyTool(toolName: string): boolean {
  return READ_ONLY_SET.has(toolName);
}
