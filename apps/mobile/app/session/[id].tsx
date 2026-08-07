import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DEMO_NOTICE,
  findExercise,
  formatSantiagoDayLabel,
  VIDEO_PENDING_LABEL,
  type ExerciseLog,
  type SessionLog,
  type TrainingExercise,
} from "@ridelab/shared";
import { useApp } from "../../src/state/AppContext";
import { KeyboardAwareScreen } from "../../src/components/keyboard";
import { SessionLogForm, type SessionLogValues } from "../../src/components/session-log-form";
import { Badge, Button, EmptyState, Loading, Notice, SectionHeader } from "../../src/components/ui";
import { Icon, type IconRole } from "../../src/components/icon";
import { repeatedFromLabel } from "../../src/lib/calendar";
import { adjustLoadsFromLastLog, midpointPercent } from "../../src/lib/loads";
import { assessmentTone, countExercises, findSession } from "../../src/lib/plan";
import { colors, featureCardToneColor, radius, spacing, TOUCH_TARGET, typography } from "../../src/theme";

/** Detalle de sesión: bloques, ejercicios, ajuste por recuperación y registro. */
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    ready,
    activePlan,
    sessionStatus,
    saveLog,
    markSession,
    logs,
    executions,
    activities,
    matches,
    startSession,
    finishSessionExecution,
    pendingLoadsPrefillExecutionId,
    clearLoadsPrefill,
    performanceResponse,
  } = useApp();

  const found = useMemo(
    () => (activePlan && id ? findSession(activePlan, id) : undefined),
    [activePlan, id],
  );

  const existingLog = useMemo(() => logs.find((log) => log.sessionId === id), [logs, id]);

  const execution = useMemo(
    () =>
      executions
        .filter((item) => item.plannedSessionId === id)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .at(-1),
    [executions, id],
  );
  const [startingSession, setStartingSession] = useState(false);

  const handleStart = useCallback(async () => {
    if (!id) return;
    setStartingSession(true);
    try {
      await startSession(id);
    } finally {
      setStartingSession(false);
    }
  }, [id, startSession]);

  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [loads, setLoads] = useState<Record<string, string>>({});
  const [reps, setReps] = useState<Record<string, string>>({});
  const [showLogForm, setShowLogForm] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [adjustmentApplied, setAdjustmentApplied] = useState(false);

  // El log más reciente de esta sesión planificada: "cargas de la última vez" y
  // la información que se muestra en la tarjeta "¿Quieres repetirla?".
  const lastLog = useMemo(
    () =>
      logs
        .filter((log) => log.sessionId === id)
        .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
        .at(-1),
    [logs, id],
  );

  // Precarga cargas/reps desde `lastLog` una sola vez, sólo cuando venimos de
  // "Repetir sesión" con el switch activado (`pendingLoadsPrefillExecutionId`
  // apunta a la ejecución recién creada) — nunca copia RPE, dolor ni el
  // vínculo con Garmin, y el usuario sigue pudiendo editarlas.
  useEffect(() => {
    if (!execution || execution.id !== pendingLoadsPrefillExecutionId || !lastLog) return;

    const nextLoads: Record<string, string> = {};
    const nextReps: Record<string, string> = {};
    for (const exerciseLog of lastLog.exercises) {
      if (exerciseLog.load) nextLoads[exerciseLog.exerciseId] = exerciseLog.load;
      if (exerciseLog.actualReps) nextReps[exerciseLog.exerciseId] = exerciseLog.actualReps;
    }
    setLoads(nextLoads);
    setReps(nextReps);
    clearLoadsPrefill();
  }, [execution, pendingLoadsPrefillExecutionId, lastLog, clearLoadsPrefill]);

  // El mismo assessment que muestra la pestaña Estado. No hay un segundo motor
  // acá: si no se ha consultado el estado de hoy, no se inventa un veredicto.
  const assessment = performanceResponse?.assessment;
  const isDemoData = performanceResponse?.snapshot.source === "mock";

  const adjustmentPercent = useMemo(
    () => (assessment ? midpointPercent(assessment.suggestedLoadAdjustmentPercent) : undefined),
    [assessment],
  );

  /** Cargas que el ajuste sugerido podría cambiar. Vacío = el botón no tiene nada que aplicar. */
  const adjustable = useMemo(() => {
    if (adjustmentPercent === undefined || !lastLog) return { loads: {}, adjustedCount: 0 };
    return adjustLoadsFromLastLog(lastLog.exercises, adjustmentPercent);
  }, [adjustmentPercent, lastLog]);

  const handleApplyAdjustment = useCallback(() => {
    setLoads((current) => ({ ...current, ...adjustable.loads }));
    setShowLogForm(true);
    setAdjustmentApplied(true);
  }, [adjustable.loads]);

  /** Omitir descarta la sesión del plan, así que se pregunta antes en vez de hacerlo al primer toque. */
  const confirmSkip = useCallback(() => {
    if (!id) return;
    Alert.alert(
      "¿Omitir esta sesión?",
      "Quedará marcada como omitida en tu plan. Puedes volver a abrirla cuando quieras.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Omitir",
          style: "destructive",
          onPress: () => void markSession(id, "skipped").then(() => router.back()),
        },
      ],
    );
  }, [id, markSession, router]);

  const handleFinish = useCallback(async (values: SessionLogValues) => {
    if (!found || !activePlan) return;
    setSaving(true);
    setSaveError(undefined);

    const exercises: ExerciseLog[] = found.session.sections.flatMap((section) =>
      section.exercises.map((exercise) => ({
        exerciseId: exercise.id,
        catalogExerciseId: exercise.catalogExerciseId,
        name: exercise.name,
        completed: completed[exercise.id] ?? false,
        load: loads[exercise.id]?.trim() || undefined,
        actualReps: reps[exercise.id]?.trim() || undefined,
      })),
    );

    const log: SessionLog = {
      id: `log_${found.session.id}_${Date.now()}`,
      planId: activePlan.id,
      sessionId: found.session.id,
      sessionTitle: found.session.title,
      weekNumber: found.week.number,
      completedAt: new Date().toISOString(),
      actualDurationMinutes: values.durationMinutes,
      sessionRpe: values.sessionRpe,
      pain: values.painLevel > 0 ? { level: values.painLevel } : undefined,
      comment: values.comment,
      exercises,
    };

    try {
      await saveLog(log);
      await finishSessionExecution(found.session.id, {
        actualRpe: values.sessionRpe,
        painLevel: values.painLevel > 0 ? values.painLevel : undefined,
        notes: values.comment,
      });
      router.back();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "No se pudo guardar el registro");
    } finally {
      setSaving(false);
    }
  }, [found, activePlan, completed, loads, reps, saveLog, finishSessionExecution, router]);

  if (!ready) return <Loading />;

  if (!activePlan || !found) {
    return (
      <EmptyState
        title="No encuentro esa sesión"
        description="Puede que el plan haya cambiado. Vuelve a Entrenamiento para ver el plan activo."
        actionLabel="Volver"
        onAction={() => router.back()}
      />
    );
  }

  const { session } = found;
  const status = sessionStatus[session.id] ?? "pending";
  const totalExercises = countExercises(session);
  const doneCount = Object.values(completed).filter(Boolean).length;

  return (
    <KeyboardAwareScreen>
      <Stack.Screen options={{ title: session.dayLabel }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        <View style={styles.headerBlock}>
          <View style={styles.headerTop}>
            <Text style={styles.title}>{session.title}</Text>
            <Badge
              text={status === "completed" ? "Completada" : status === "skipped" ? "Omitida" : "Pendiente"}
              tone={status === "completed" ? "good" : "neutral"}
            />
          </View>
          <Text style={styles.focus}>{session.focus}</Text>
          <View style={styles.meta}>
            <Icon role="timer" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>{session.estimatedMinutes} min</Text>
            <Text style={styles.metaDot}>·</Text>
            <Icon role="exerciseCount" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>{totalExercises} ejercicios</Text>
            <Text style={styles.metaDot}>·</Text>
            <Icon role="checkCircleFilled" size={14} color={colors.textMuted} />
            <Text style={styles.metaText}>
              {doneCount}/{totalExercises} marcados
            </Text>
          </View>
        </View>

        {!execution ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void handleStart()}
            disabled={startingSession}
            style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
          >
            <Icon role="playCircle" size={20} color={colors.onPrimary} />
            <Text style={styles.startButtonText}>{startingSession ? "Iniciando…" : "Iniciar sesión"}</Text>
          </Pressable>
        ) : execution.status === "started" ? (
          <Notice text={`Sesión en curso desde las ${new Date(execution.startedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}.`} tone="info" />
        ) : null}

        {execution ? (
          (() => {
            const originLabel = repeatedFromLabel(execution, executions);
            return originLabel ? <Notice text={originLabel} tone="info" /> : null;
          })()
        ) : null}

        {execution?.status === "completed" ? (
          <RepeatSessionCard
            execution={execution}
            lastLog={lastLog}
            garminActivityName={
              activities.find(
                (activity) =>
                  activity.id ===
                  matches.find((match) => match.sessionExecutionId === execution.id && match.status !== "rejected")
                    ?.garminActivityId,
              )?.name
            }
            onRepeat={() => router.push(`/session/repeat/${session.id}`)}
          />
        ) : null}

        {assessment ? (
          <View style={styles.adviceCard}>
            <View style={styles.adviceHeadRow}>
              <Icon
                role={adviceIcon(assessmentTone(assessment.level))}
                size={20}
                color={featureCardToneColor[assessmentTone(assessment.level)]}
              />
              <View style={styles.flex}>
                <Text style={styles.adviceLabel}>Tu recuperación de hoy</Text>
                <Text
                  style={[styles.adviceTitle, { color: featureCardToneColor[assessmentTone(assessment.level)] }]}
                >
                  {assessment.label}
                </Text>
              </View>
            </View>
            <Text style={styles.adviceDetail}>{assessment.recommendation}</Text>
            {isDemoData ? <Text style={styles.adviceDemo}>{DEMO_NOTICE}</Text> : null}

            {/* El botón sólo aparece si de verdad hay cargas previas que escalar:
                un control que promete una acción tiene que poder cumplirla. */}
            {adjustable.adjustedCount > 0 && adjustmentPercent !== undefined ? (
              <Pressable
                accessibilityRole="button"
                disabled={adjustmentApplied}
                onPress={handleApplyAdjustment}
                style={[styles.adviceButton, adjustmentApplied && styles.adviceButtonDisabled]}
              >
                <Text style={styles.adviceButtonText}>
                  {adjustmentApplied
                    ? "Ajuste aplicado"
                    : `Aplicar ${formatPercent(adjustmentPercent)} a tus cargas`}
                </Text>
              </Pressable>
            ) : adjustmentPercent !== undefined ? (
              <Text style={styles.adviceDetail}>
                Ajuste sugerido: {formatPercent(adjustmentPercent)} de carga. Cuando registres esta sesión
                podré aplicarlo sobre las cargas de la vez anterior.
              </Text>
            ) : null}
          </View>
        ) : (
          <Notice
            text="Todavía no consultaste tu estado de hoy, así que no propongo ajustes. Abre Estado y toca Actualizar."
            tone="info"
          />
        )}

        {adjustmentApplied && adjustmentPercent !== undefined ? (
          <Notice
            text={`Cargas ajustadas ${formatPercent(adjustmentPercent)} respecto de la última vez en ${
              adjustable.adjustedCount
            } ${adjustable.adjustedCount === 1 ? "ejercicio" : "ejercicios"}. Puedes editarlas antes de guardar.`}
            tone="info"
          />
        ) : null}

        {existingLog ? (
          <Notice
            text={`Ya registraste esta sesión el ${new Date(existingLog.completedAt).toLocaleDateString("es-CL")}.`}
            tone="info"
          />
        ) : null}

        {session.sections.map((section) => (
          <View key={section.id}>
            <SectionHeader title={section.title} hint={`${section.exercises.length} ejercicios`} />
            <View style={styles.list}>
              {section.exercises.map((exercise) => (
                <ExerciseCard
                  key={exercise.id}
                  exercise={exercise}
                  checked={completed[exercise.id] ?? false}
                  load={loads[exercise.id] ?? ""}
                  reps={reps[exercise.id] ?? ""}
                  showInputs={showLogForm}
                  onToggle={() =>
                    setCompleted((current) => ({ ...current, [exercise.id]: !current[exercise.id] }))
                  }
                  onLoadChange={(value) => setLoads((current) => ({ ...current, [exercise.id]: value }))}
                  onRepsChange={(value) => setReps((current) => ({ ...current, [exercise.id]: value }))}
                  onOpenTechnique={() => router.push(`/exercise/${exercise.catalogExerciseId}`)}
                />
              ))}
            </View>
          </View>
        ))}

        {showLogForm ? (
          <SessionLogForm
            estimatedMinutes={session.estimatedMinutes}
            saving={saving}
            saveError={saveError}
            onSubmit={(values) => void handleFinish(values)}
            onCancel={() => setShowLogForm(false)}
          />
        ) : (
          <View style={styles.footerActions}>
            <Button label="Finalizar sesión" onPress={() => setShowLogForm(true)} />
            <Button label="Omitir sesión" variant="ghost" onPress={confirmSkip} />
          </View>
        )}
      </ScrollView>
    </KeyboardAwareScreen>
  );
}

/** Tarjeta de ejercicio con miniatura, prescripción, cues y acciones. */
function ExerciseCard({
  exercise,
  checked,
  load,
  reps,
  showInputs,
  onToggle,
  onLoadChange,
  onRepsChange,
  onOpenTechnique,
}: {
  exercise: TrainingExercise;
  checked: boolean;
  load: string;
  reps: string;
  showInputs: boolean;
  onToggle: () => void;
  onLoadChange: (value: string) => void;
  onRepsChange: (value: string) => void;
  onOpenTechnique: () => void;
}) {
  const catalogEntry = findExercise(exercise.catalogExerciseId);
  const thumbnail = exercise.thumbnailUrl ?? catalogEntry?.thumbnailUrl;
  const hasVideo = Boolean(exercise.videoUrl ?? catalogEntry?.videoUrl);

  // "10" se muestra como "10 reps", pero "8 por pierna" ya se explica solo.
  const repsText = exercise.reps
    ? /[a-zá-ú]/i.test(exercise.reps)
      ? exercise.reps
      : `${exercise.reps} reps`
    : undefined;

  const prescription = [
    exercise.sets ? `${exercise.sets} series` : undefined,
    repsText,
    exercise.durationSeconds ? `${exercise.durationSeconds}s` : undefined,
    exercise.distanceMeters ? `${exercise.distanceMeters} m` : undefined,
    exercise.restSeconds !== undefined ? `${exercise.restSeconds}s descanso` : undefined,
    exercise.rpe,
  ].filter(Boolean);

  return (
    <View style={styles.exerciseCard}>
      <View style={styles.exerciseTop}>
        {thumbnail ? (
          <Image source={{ uri: thumbnail }} style={styles.thumb} resizeMode="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Text style={styles.thumbEmptyText}>Sin imagen</Text>
          </View>
        )}
        <View style={styles.exerciseHead}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          <Text style={styles.exerciseWhy}>{exercise.why}</Text>
        </View>
      </View>

      {prescription.length > 0 ? <Text style={styles.prescription}>{prescription.join(" · ")}</Text> : null}
      {exercise.loadGuidance ? <Text style={styles.loadGuidance}>{exercise.loadGuidance}</Text> : null}

      {exercise.techniqueCues.length > 0 ? (
        <View style={styles.cues}>
          {exercise.techniqueCues.slice(0, 3).map((cue) => (
            <Text key={cue} style={styles.cue}>
              • {cue}
            </Text>
          ))}
        </View>
      ) : null}

      {showInputs ? (
        <View style={styles.inputsRow}>
          <TextInput
            value={load}
            onChangeText={onLoadChange}
            placeholder="Carga (ej: 20 kg)"
            placeholderTextColor={colors.textFaint}
            style={[styles.input, styles.inputSmall]}
          />
          <TextInput
            value={reps}
            onChangeText={onRepsChange}
            placeholder="Reps reales"
            placeholderTextColor={colors.textFaint}
            style={[styles.input, styles.inputSmall]}
          />
        </View>
      ) : null}

      <View style={styles.exerciseActions}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          onPress={onToggle}
          style={styles.checkboxRow}
        >
          <Icon
            role={checked ? "checkCircleFilled" : "checkCircleOutline"}
            size={22}
            color={checked ? colors.primary : colors.outlineVariant}
          />
          <Text style={styles.checkboxLabel}>Completado</Text>
        </Pressable>

        <Pressable accessibilityRole="button" onPress={onOpenTechnique} style={styles.techniqueButton}>
          <Icon role="playCircle" size={16} color={colors.accent} />
          <Text style={styles.techniqueText}>{hasVideo ? "Ver técnica" : VIDEO_PENDING_LABEL}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Tarjeta "¿Quieres repetirla?" para una sesión ya completada: resume la última vez y ofrece repetirla. */
function RepeatSessionCard({
  execution,
  lastLog,
  garminActivityName,
  onRepeat,
}: {
  execution: { startedAt: string; finishedAt?: string; actualRpe?: number };
  lastLog: SessionLog | undefined;
  garminActivityName: string | undefined;
  onRepeat: () => void;
}) {
  const durationMinutes =
    execution.finishedAt !== undefined
      ? Math.round((new Date(execution.finishedAt).getTime() - new Date(execution.startedAt).getTime()) / 60_000)
      : undefined;

  const loadsUsed = (lastLog?.exercises ?? [])
    .filter((exercise) => exercise.load || exercise.actualReps)
    .slice(0, 3);

  return (
    <View style={styles.repeatCard}>
      <View style={styles.repeatHeadRow}>
        <Icon role="repeat" size={20} color={colors.accent} />
        <Text style={styles.repeatTitle}>¿Quieres repetirla?</Text>
      </View>
      <Text style={styles.repeatMeta}>
        {[
          `Última vez: ${formatSantiagoDayLabel(execution.startedAt)}`,
          durationMinutes !== undefined ? `${durationMinutes} min` : undefined,
          execution.actualRpe !== undefined ? `RPE ${execution.actualRpe}` : undefined,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {loadsUsed.length > 0 ? (
        <View style={styles.repeatLoads}>
          {loadsUsed.map((exercise) => (
            <Text key={exercise.exerciseId} style={styles.repeatLoadLine}>
              • {exercise.name}: {[exercise.load, exercise.actualReps].filter(Boolean).join(" · ")}
            </Text>
          ))}
        </View>
      ) : null}
      {garminActivityName ? (
        <Text style={styles.repeatGarmin}>Vinculada a Garmin: {garminActivityName}</Text>
      ) : null}
      <Pressable accessibilityRole="button" onPress={onRepeat} style={styles.repeatButton}>
        <Icon role="repeat" size={16} color={colors.onAccent} />
        <Text style={styles.repeatButtonText}>Repetir sesión</Text>
      </Pressable>
    </View>
  );
}

function adviceIcon(tone: "good" | "warning" | "bad"): IconRole {
  return tone === "good" ? "recoveryGood" : tone === "warning" ? "recoveryWarning" : "warning";
}

/** "−15%" / "+7.5%", con el signo explícito porque la dirección es lo que importa. */
function formatPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}%`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl },

  headerBlock: { gap: spacing.sm },
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  title: { ...typography.title, color: colors.text, flex: 1 },
  focus: { ...typography.body, color: colors.textMuted },
  meta: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  metaText: { ...typography.caption, color: colors.textMuted },
  metaDot: { ...typography.caption, color: colors.textFaint },

  startButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  startButtonPressed: { opacity: 0.85 },
  startButtonText: { ...typography.bodyStrong, color: colors.onPrimary },

  flex: { flex: 1 },
  adviceCard: {
    backgroundColor: colors.featureCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  adviceHeadRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  adviceLabel: {
    ...typography.caption,
    color: colors.onFeatureCardFaint,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  adviceTitle: { ...typography.subtitle },
  adviceDetail: { ...typography.caption, color: colors.onFeatureCardMuted, lineHeight: 18 },
  adviceDemo: { ...typography.caption, color: colors.warningOnDark },
  adviceButton: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.primaryFixed,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  adviceButtonDisabled: { opacity: 0.5 },
  adviceButtonText: { ...typography.bodyStrong, color: colors.onPrimaryFixed },

  list: { gap: spacing.md },

  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  exerciseTop: { flexDirection: "row", gap: spacing.md },
  thumb: { width: 84, height: 60, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  thumbEmptyText: { ...typography.caption, color: colors.textFaint, fontSize: 10 },
  exerciseHead: { flex: 1, gap: 2 },
  exerciseName: { ...typography.subtitle, color: colors.text },
  exerciseWhy: { ...typography.caption, color: colors.textMuted, lineHeight: 17 },

  prescription: { ...typography.bodyStrong, color: colors.accent },
  loadGuidance: { ...typography.caption, color: colors.textMuted },
  cues: { gap: 2 },
  cue: { ...typography.caption, color: colors.textFaint, lineHeight: 17 },

  inputsRow: { flexDirection: "row", gap: spacing.sm },
  // `flexBasis: 0` + `minWidth: 0` evitan que el campo crezca hasta el ancho de
  // su placeholder y se salga de la tarjeta en pantallas de 360 px.
  inputSmall: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, minHeight: 42 },

  exerciseActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: TOUCH_TARGET, flex: 1 },
  checkboxLabel: { ...typography.caption, color: colors.textMuted },
  techniqueButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  techniqueText: { ...typography.caption, color: colors.accent, fontWeight: "700" },

  /** Campo de carga/reps dentro de una tarjeta de ejercicio. */
  input: {
    minHeight: TOUCH_TARGET,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    ...typography.body,
  },

  footerActions: { gap: spacing.sm },

  repeatCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  repeatHeadRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  repeatTitle: { ...typography.subtitle, color: colors.text },
  repeatMeta: { ...typography.caption, color: colors.textMuted },
  repeatLoads: { gap: 2 },
  repeatLoadLine: { ...typography.caption, color: colors.textFaint, lineHeight: 17 },
  repeatGarmin: { ...typography.caption, color: colors.primary },
  repeatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    marginTop: spacing.xs,
  },
  repeatButtonText: { ...typography.bodyStrong, color: colors.onAccent },
});
