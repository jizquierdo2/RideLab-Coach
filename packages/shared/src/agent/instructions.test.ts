import { describe, expect, it } from "vitest";
import { looksLikePlanRequest } from "./instructions";

describe("looksLikePlanRequest", () => {
  it("reconoce pedidos directos de crear un plan", () => {
    expect(looksLikePlanRequest("Hazme un plan de entrenamiento para MTB")).toBe(true);
    expect(looksLikePlanRequest("Créame un plan de fuerza funcional")).toBe(true);
    expect(looksLikePlanRequest("Arma el plan con estos ejercicios")).toBe(true);
    expect(looksLikePlanRequest("Genera un plan de 4 semanas")).toBe(true);
  });

  it("reconoce el pedido real que falló contra el modelo", () => {
    const message =
      "Hazme este plan de entrenamiento y modificado si lo vez necesario, el fin es mejorar en el mtb, " +
      "yo peso mas o menos 90 kilos y mido 187 y me considero fuerte. Hazme el plan y ponme mas o menos " +
      "que peso deberia manejar en cada uno de los ejercicios: 🏋️‍♂️ Plan MTB Funcional (2 días a la semana)";
    expect(looksLikePlanRequest(message)).toBe(true);
  });

  it("reconoce un reintento corto que sólo menciona 'planes'", () => {
    expect(looksLikePlanRequest("Hazme los planes de entrenamiento con esos ejercicio")).toBe(true);
  });

  it("reconoce pedidos de ajustar un plan existente", () => {
    expect(looksLikePlanRequest("Ajusta mi plan para esta semana")).toBe(true);
    expect(looksLikePlanRequest("Modifica el plan, quita el día 2")).toBe(true);
  });

  it("no dispara con preguntas sobre un plan ya existente", () => {
    expect(looksLikePlanRequest("¿Qué plan tengo hoy?")).toBe(false);
    expect(looksLikePlanRequest("¿Cómo va mi plan esta semana?")).toBe(false);
    expect(looksLikePlanRequest("¿Cómo está mi recuperación hoy?")).toBe(false);
  });

  it("no dispara con mensajes sin la palabra plan", () => {
    expect(looksLikePlanRequest("¿Estoy listo para entrenar fuerte?")).toBe(false);
  });
});
