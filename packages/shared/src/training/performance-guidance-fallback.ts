import type { PerformanceAssessment, PerformanceGuidance } from "../types/performance";

/**
 * Guidance de respaldo, armado directo desde el `PerformanceAssessment` — sin
 * LLM. La usa `MockAgentGateway` siempre, y `OpenAIAgentGateway` cuando el
 * agente real falla (nunca se deja al usuario sin mensaje).
 */
const FALLBACK: Record<PerformanceAssessment["level"], PerformanceGuidance> = {
  push: {
    todayMessage: "Tus señales están arriba de lo normal: puedes seguir el plan con confianza.",
    nextWorkoutAdvice: "Si la técnica se mantiene sólida, considera subir un poco la carga en tu próxima sesión.",
    weeklyApproach: "Aprovecha esta ventana para meter algo más de intensidad en la primera mitad de la semana.",
    motivationalLine: "Buen momento para empujar un poco más.",
  },
  solid: {
    todayMessage: "Estás en buen estado para entrenar normal.",
    nextWorkoutAdvice: "Sigue tu próxima sesión tal como está planificada.",
    weeklyApproach: "Mantén el ritmo de la semana sin agregar volumen extra.",
    motivationalLine: "Constancia: eso es lo que suma.",
  },
  controlled: {
    todayMessage: "Tus señales sugieren bajar un poco la exigencia hoy.",
    nextWorkoutAdvice: "Reduce el volumen o la intensidad de tu próxima sesión.",
    weeklyApproach: "Prioriza calidad sobre cantidad el resto de la semana.",
    motivationalLine: "Ajustar a tiempo es parte de progresar.",
  },
  recover: {
    todayMessage: "Tu cuerpo está pidiendo recuperación hoy.",
    nextWorkoutAdvice: "Cambia tu próxima sesión por movilidad, técnica suave o descanso.",
    weeklyApproach: "Deja los esfuerzos exigentes para cuando tus datos mejoren.",
    motivationalLine: "Recuperar también es entrenar.",
  },
  insufficient: {
    todayMessage: "Todavía no tengo suficientes datos para evaluarte hoy.",
    nextWorkoutAdvice: "Sincroniza tu reloj o registra tu próxima sesión para poder ayudarte mejor.",
    weeklyApproach: "En cuanto haya más datos, te doy una lectura de la semana.",
    motivationalLine: "Cada sincronización suma información útil.",
  },
};

export function fallbackGuidance(assessment: PerformanceAssessment): PerformanceGuidance {
  return FALLBACK[assessment.level];
}
