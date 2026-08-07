import { describe, expect, it } from "vitest";
import { adjustLoadsFromLastLog, midpointPercent, scaleLoadText } from "./loads";

describe("midpointPercent", () => {
  it("toma el punto medio del rango sugerido", () => {
    expect(midpointPercent({ min: -20, max: -10 })).toBe(-15);
    expect(midpointPercent({ min: 5, max: 10 })).toBe(7.5);
  });

  it("no propone ajuste cuando no hay rango o el punto medio es cero", () => {
    expect(midpointPercent(undefined)).toBeUndefined();
    expect(midpointPercent({ min: -10, max: 10 })).toBeUndefined();
  });
});

describe("scaleLoadText", () => {
  it("escala el número y conserva la unidad tal cual venía", () => {
    expect(scaleLoadText("24 kg", -15)).toBe("20.5 kg");
    expect(scaleLoadText("40cm", -15)).toBe("34cm");
  });

  it("acepta coma decimal y la normaliza", () => {
    expect(scaleLoadText("22,5 kg", -20)).toBe("18 kg");
  });

  it("no inventa un número cuando la carga no lo tiene", () => {
    expect(scaleLoadText("peso corporal", -15)).toBeUndefined();
    expect(scaleLoadText("", -15)).toBeUndefined();
  });

  it("devuelve undefined si el redondeo dejaría la carga igual", () => {
    // 3 × 0.85 = 2.55 → 2.5, sí cambia; 1 × 1.075 = 1.075 → 1, no cambia.
    expect(scaleLoadText("1 kg", 7.5)).toBeUndefined();
  });

  it("nunca devuelve una carga de cero o negativa", () => {
    expect(scaleLoadText("0 kg", -15)).toBeUndefined();
  });
});

describe("adjustLoadsFromLastLog", () => {
  it("ajusta sólo las cargas escalables e informa cuántas fueron", () => {
    const result = adjustLoadsFromLastLog(
      [
        { exerciseId: "ex1", load: "24 kg" },
        { exerciseId: "ex2" },
        { exerciseId: "ex3", load: "peso corporal" },
        { exerciseId: "ex4", load: "40 cm" },
      ],
      -15,
    );

    expect(result.adjustedCount).toBe(2);
    expect(result.loads).toEqual({ ex1: "20.5 kg", ex4: "34 cm" });
  });

  it("informa cero cuando no hay ninguna carga previa que escalar", () => {
    const result = adjustLoadsFromLastLog([{ exerciseId: "ex1" }], -15);
    expect(result.adjustedCount).toBe(0);
    expect(result.loads).toEqual({});
  });
});
