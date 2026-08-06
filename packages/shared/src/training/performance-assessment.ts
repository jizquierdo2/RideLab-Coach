import type { PerformanceAssessment, PerformanceSnapshot } from "../types/performance";

/**
 * `PerformanceAssessmentService`: motor de evaluación determinístico.
 *
 * Regla dura del producto: NUNCA depende del LLM para decidir si el usuario
 * debe entrenar fuerte. Training Readiness es la señal principal; si no está,
 * se compone desde sueño/HRV/Body Battery/FC reposo/estrés — nunca se compara
 * primero contra promedios poblacionales genéricos, siempre contra la línea
 * base propia que entrega Garmin.
 *
 * Todos los umbrales y ponderaciones viven acá, centralizados — no se
 * dispersan en componentes de UI ni en el backend.
 */
export const ASSESSMENT_CONFIG = {
  /** Umbrales de Training Readiness (o del compuesto) para cada nivel. */
  readinessThresholds: {
    push: 80,
    solid: 60,
    controlled: 40,
    // por debajo de `controlled` es "recover".
  },
  /** Ajuste de carga sugerido por nivel, en porcentaje. */
  loadAdjustmentPercent: {
    push: { min: 5, max: 10 },
    controlled: { min: -20, max: -10 },
  },
  /** Mínimo de señales secundarias disponibles para armar un compuesto sin Training Readiness. */
  minSecondarySignalsForComposite: 2,
} as const;

export type AssessmentConfig = typeof ASSESSMENT_CONFIG;

type Level = PerformanceAssessment["level"];

const LABEL: Record<Level, PerformanceAssessment["label"]> = {
  push: "Con fuerza",
  solid: "Sólido",
  controlled: "Carga controlada",
  recover: "Recuperar",
  insufficient: "Faltan datos",
};

const TRAINING_MODE: Record<Level, PerformanceAssessment["suggestedTrainingMode"]> = {
  push: "increase_slightly",
  solid: "follow_plan",
  controlled: "reduce_load",
  recover: "recovery_only",
  insufficient: "unknown",
};

const HEADLINE: Record<Level, string> = {
  push: "Hoy estás con fuerza.",
  solid: "Hoy estás sólido.",
  controlled: "Hoy conviene controlar la carga.",
  recover: "Tu recuperación está por debajo de tu nivel habitual.",
  insufficient: "Todavía no tengo datos suficientes para evaluarte hoy.",
};

const RECOMMENDATION: Record<Level, string> = {
  push: "Puedes seguir el plan y considerar un aumento pequeño si tu técnica se mantiene sólida.",
  solid: "Haz la sesión planificada. Mantén la carga y evita agregar volumen extra.",
  controlled: "Reduce el volumen o la intensidad de tu próxima sesión.",
  recover: "Evita una sesión intensa. Prioriza movilidad, técnica suave o descanso total.",
  insufficient: "Sincroniza tu reloj o registra una sesión para que pueda evaluar tu estado.",
};

function classify(score: number, config: AssessmentConfig): Level {
  if (score >= config.readinessThresholds.push) return "push";
  if (score >= config.readinessThresholds.solid) return "solid";
  if (score >= config.readinessThresholds.controlled) return "controlled";
  return "recover";
}

/** Estado de HRV a un puntaje comparable con el resto de señales (0-100, más alto = mejor). */
function hrvStatusScore(status: string | undefined): number | undefined {
  switch (status?.toLowerCase()) {
    case "balanced":
      return 85;
    case "unbalanced":
      return 45;
    case "low":
      return 30;
    case "poor":
      return 15;
    default:
      return undefined;
  }
}

function restingHeartRateScore(value: number | undefined, baseline: number | undefined): number | undefined {
  if (value === undefined || baseline === undefined) return undefined;
  if (value <= baseline) return 80;
  if (value <= baseline + 3) return 60;
  return 35;
}

interface CompositeResult {
  score: number | undefined;
  usableSignals: number;
}

/** Compuesto usado sólo cuando falta Training Readiness. */
function compositeScore(snapshot: PerformanceSnapshot): CompositeResult {
  const values = [
    snapshot.sleep?.score,
    hrvStatusScore(snapshot.hrv?.status),
    snapshot.bodyBattery?.current,
    restingHeartRateScore(snapshot.restingHeartRate?.value, snapshot.restingHeartRate?.baseline),
    snapshot.stress?.average !== undefined ? 100 - snapshot.stress.average : undefined,
  ].filter((value): value is number => value !== undefined);

  if (values.length === 0) return { score: undefined, usableSignals: 0 };
  return { score: values.reduce((sum, v) => sum + v, 0) / values.length, usableSignals: values.length };
}

function buildDrivers(snapshot: PerformanceSnapshot): { positive: string[]; caution: string[] } {
  const positive: string[] = [];
  const caution: string[] = [];

  if (snapshot.sleep?.score !== undefined) {
    if (snapshot.sleep.score >= 75) positive.push(`Sueño reparador (puntuación ${snapshot.sleep.score})`);
    else if (snapshot.sleep.score < 50) caution.push(`Sueño insuficiente (puntuación ${snapshot.sleep.score})`);
  }

  const hrvStatus = snapshot.hrv?.status?.toLowerCase();
  if (hrvStatus === "balanced") positive.push("HRV equilibrado");
  else if (hrvStatus === "unbalanced" || hrvStatus === "low" || hrvStatus === "poor") {
    caution.push("HRV por debajo de tu línea base");
  }

  if (snapshot.bodyBattery?.current !== undefined) {
    if (snapshot.bodyBattery.current >= 70) positive.push(`Body Battery alto (${snapshot.bodyBattery.current})`);
    else if (snapshot.bodyBattery.current < 35) caution.push(`Body Battery bajo (${snapshot.bodyBattery.current})`);
  }

  const rhr = snapshot.restingHeartRate;
  if (rhr?.value !== undefined && rhr.baseline !== undefined) {
    if (rhr.value <= rhr.baseline) positive.push("Frecuencia cardíaca en reposo dentro de tu línea base");
    else if (rhr.value > rhr.baseline + 3) caution.push("Frecuencia cardíaca en reposo elevada");
  }

  if (snapshot.stress?.average !== undefined) {
    if (snapshot.stress.average <= 30) positive.push("Estrés bajo");
    else if (snapshot.stress.average >= 60) caution.push("Estrés elevado");
  }

  if (snapshot.acuteLoad?.status) {
    const status = snapshot.acuteLoad.status.toLowerCase();
    if (status.includes("optim") || status.includes("óptim")) positive.push("Carga aguda en rango óptimo");
    else caution.push(`Carga aguda: ${snapshot.acuteLoad.status}`);
  }

  if (snapshot.recovery?.remainingHours !== undefined && snapshot.recovery.remainingHours > 0) {
    caution.push(`${snapshot.recovery.remainingHours}h de recuperación pendientes`);
  }

  return { positive, caution };
}

/**
 * Evalúa un snapshot y devuelve el assessment del día. Puro, sin I/O,
 * testeable con un `PerformanceSnapshot` fabricado a mano.
 */
export function assessPerformance(
  snapshot: PerformanceSnapshot,
  config: AssessmentConfig = ASSESSMENT_CONFIG,
): PerformanceAssessment {
  const { positive, caution } = buildDrivers(snapshot);

  let level: Level;
  const readinessScore = snapshot.trainingReadiness?.score;

  if (snapshot.dataQuality === "insufficient") {
    level = "insufficient";
  } else if (readinessScore !== undefined) {
    level = classify(readinessScore, config);
  } else {
    const composite = compositeScore(snapshot);
    level =
      composite.score === undefined || composite.usableSignals < config.minSecondarySignalsForComposite
        ? "insufficient"
        : classify(composite.score, config);
  }

  const loadAdjustment =
    level === "push"
      ? config.loadAdjustmentPercent.push
      : level === "controlled"
        ? config.loadAdjustmentPercent.controlled
        : undefined;

  return {
    level,
    label: LABEL[level],
    headline: HEADLINE[level],
    recommendation: RECOMMENDATION[level],
    suggestedTrainingMode: TRAINING_MODE[level],
    suggestedLoadAdjustmentPercent: loadAdjustment,
    positiveDrivers: positive,
    cautionDrivers: caution,
    dataQuality: snapshot.dataQuality,
  };
}
