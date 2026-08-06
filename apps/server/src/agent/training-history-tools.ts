import type { ChatTrainingHistoryEntry } from "@ridelab/shared";

/**
 * Resolución pura de `get_training_history` y `get_training_record`.
 *
 * El backend no tiene datastore propio para esto: el historial ya viaja en
 * `ChatRequest.trainingHistory` (armado por la app desde AsyncStorage). Estas
 * funciones sólo filtran/recortan lo que ya llegó — nunca hacen I/O — y su
 * resultado se le devuelve al modelo como resultado de la tool, no se inyecta
 * en el prompt de antemano.
 */

export interface GetTrainingHistoryArgs {
  startDate?: string;
  endDate?: string;
  includeGarminMetrics?: boolean;
}

const GARMIN_FIELDS = [
  "garminActivityName",
  "garminActivityType",
  "garminDurationSeconds",
  "garminAverageHeartRate",
  "garminMaxHeartRate",
  "garminCalories",
  "garminAerobicTrainingEffect",
  "garminAnaerobicTrainingEffect",
] as const satisfies readonly (keyof ChatTrainingHistoryEntry)[];

export function getTrainingHistoryTool(
  entries: readonly ChatTrainingHistoryEntry[],
  args: GetTrainingHistoryArgs,
): ChatTrainingHistoryEntry[] {
  const { startDate, endDate, includeGarminMetrics = true } = args;

  const filtered = entries.filter((entry) => {
    if (startDate && entry.date < startDate) return false;
    if (endDate && entry.date > endDate) return false;
    return true;
  });

  if (includeGarminMetrics) return filtered;

  return filtered.map((entry) => {
    const stripped = { ...entry };
    for (const field of GARMIN_FIELDS) delete stripped[field];
    return stripped;
  });
}

export interface GetTrainingRecordArgs {
  sessionId: string;
}

export function getTrainingRecordTool(
  entries: readonly ChatTrainingHistoryEntry[],
  args: GetTrainingRecordArgs,
): ChatTrainingHistoryEntry | null {
  // Una sesión repetida crea una entrada nueva con el mismo `plannedSessionId`:
  // se toma la más reciente por fecha, no la primera, para no devolver un
  // registro obsoleto cuando ya existe una repetición más nueva.
  const matches = entries.filter((entry) => entry.plannedSessionId === args.sessionId);
  return matches.length > 0 ? matches[matches.length - 1] : null;
}
