import { describe, expect, it } from "vitest";
import { formatSantiagoTime, overlapMinutes, santiagoDayKey } from "./local-time";

describe("santiagoDayKey", () => {
  it("convierte un ISO UTC a la fecha local de Santiago (UTC-4 en invierno)", () => {
    // 2026-08-05T23:04:00Z son las 19:04 en Santiago: mismo día.
    expect(santiagoDayKey("2026-08-05T23:04:00.000Z")).toBe("2026-08-05");
  });

  it("cruza correctamente la medianoche", () => {
    // 2026-08-06T02:00:00Z son las 22:00 del 5 de agosto en Santiago.
    expect(santiagoDayKey("2026-08-06T02:00:00.000Z")).toBe("2026-08-05");
    // 2026-08-06T04:30:00Z ya son las 00:30 del 6 de agosto en Santiago.
    expect(santiagoDayKey("2026-08-06T04:30:00.000Z")).toBe("2026-08-06");
  });
});

describe("formatSantiagoTime", () => {
  it("muestra la hora local de Santiago en formato HH:mm", () => {
    expect(formatSantiagoTime("2026-08-05T23:04:00.000Z")).toBe("19:04");
  });
});

describe("overlapMinutes", () => {
  it("calcula los minutos de superposición entre dos rangos", () => {
    const minutes = overlapMinutes(
      "2026-08-05T23:04:00.000Z",
      "2026-08-06T00:04:00.000Z",
      "2026-08-05T23:08:00.000Z",
      "2026-08-06T00:06:12.000Z",
    );
    expect(minutes).toBeCloseTo(56, 0);
  });

  it("devuelve 0 cuando los rangos no se solapan", () => {
    const minutes = overlapMinutes(
      "2026-08-05T10:00:00.000Z",
      "2026-08-05T11:00:00.000Z",
      "2026-08-05T12:00:00.000Z",
      "2026-08-05T13:00:00.000Z",
    );
    expect(minutes).toBe(0);
  });
});
