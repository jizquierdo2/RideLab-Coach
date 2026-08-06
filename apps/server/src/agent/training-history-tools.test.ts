import { describe, expect, it } from "vitest";
import type { ChatTrainingHistoryEntry } from "@ridelab/shared";
import { getTrainingHistoryTool, getTrainingRecordTool } from "./training-history-tools";

const entries: ChatTrainingHistoryEntry[] = [
  {
    kind: "session",
    date: "2026-08-05",
    plannedSessionId: "w1-d1",
    plannedTitle: "Potencia de Empuje e Impacto",
    executionStatus: "completed",
    startedAt: "2026-08-05T23:04:00.000Z",
    actualRpe: 7,
    garminActivityName: "Cardio",
    garminAverageHeartRate: 142,
    matchStatus: "confirmed",
  },
  {
    kind: "session",
    date: "2026-07-20",
    plannedSessionId: "w1-d2",
    plannedTitle: "Cadena Posterior",
    executionStatus: "completed",
    startedAt: "2026-07-20T20:00:00.000Z",
  },
  {
    kind: "freeActivity",
    date: "2026-08-03",
    garminActivityName: "Salida libre",
  },
];

describe("getTrainingHistoryTool", () => {
  it("filtra por rango de fechas", () => {
    const result = getTrainingHistoryTool(entries, { startDate: "2026-08-01", endDate: "2026-08-31" });
    expect(result).toHaveLength(2);
    expect(result.every((entry) => entry.date >= "2026-08-01")).toBe(true);
  });

  it("sin fechas, devuelve todo el historial disponible", () => {
    expect(getTrainingHistoryTool(entries, {})).toHaveLength(3);
  });

  it("omite los campos de Garmin cuando includeGarminMetrics es false", () => {
    const [result] = getTrainingHistoryTool(entries, { startDate: "2026-08-05", endDate: "2026-08-05", includeGarminMetrics: false });
    expect(result.garminActivityName).toBeUndefined();
    expect(result.garminAverageHeartRate).toBeUndefined();
    expect(result.plannedTitle).toBe("Potencia de Empuje e Impacto");
  });
});

describe("getTrainingRecordTool", () => {
  it("devuelve el registro de una sesión por su id", () => {
    const result = getTrainingRecordTool(entries, { sessionId: "w1-d1" });
    expect(result?.plannedTitle).toBe("Potencia de Empuje e Impacto");
    expect(result?.actualRpe).toBe(7);
  });

  it("devuelve null si no existe esa sesión", () => {
    expect(getTrainingRecordTool(entries, { sessionId: "no-existe" })).toBeNull();
  });

  it("si la sesión se repitió, devuelve la ejecución más reciente y su origen", () => {
    const withRepeat: ChatTrainingHistoryEntry[] = [
      ...entries,
      {
        kind: "session",
        date: "2026-08-12",
        plannedSessionId: "w1-d1",
        plannedTitle: "Potencia de Empuje e Impacto",
        executionStatus: "completed",
        startedAt: "2026-08-12T23:00:00.000Z",
        actualRpe: 6,
        origin: "repeated",
        sourceExecutionId: "exec_w1-d1_original",
      },
    ];
    const result = getTrainingRecordTool(withRepeat, { sessionId: "w1-d1" });
    expect(result?.date).toBe("2026-08-12");
    expect(result?.origin).toBe("repeated");
    expect(result?.sourceExecutionId).toBe("exec_w1-d1_original");
  });
});
