import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { formatSantiagoDayLabel } from "@ridelab/shared";
import { useApp } from "../../../src/state/AppContext";
import { EmptyState, Loading, Notice } from "../../../src/components/ui";
import { Icon } from "../../../src/components/icon";
import { findPlannedSession } from "../../../src/lib/calendar";
import { colors, radius, spacing, TOUCH_TARGET, typography } from "../../../src/theme";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Bottom sheet de "Repetir sesión": Entrenar ahora / Programar para otro día,
 * con el switch "Usar cargas de la última vez". Nunca toca la ejecución
 * original — sólo crea una occurrence + execution nuevas (`origin: "repeated"`).
 */
export default function RepeatSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { ready, plans, executions, logs, activities, matches, repeatSessionNow, repeatSessionSchedule } = useApp();

  const plannedSession = useMemo(() => (id ? findPlannedSession(plans, id) : undefined), [plans, id]);

  const sourceExecution = useMemo(
    () =>
      executions
        .filter((execution) => execution.plannedSessionId === id && execution.status === "completed")
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
        .at(-1),
    [executions, id],
  );

  const lastLog = useMemo(
    () =>
      logs
        .filter((log) => log.sessionId === id)
        .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
        .at(-1),
    [logs, id],
  );

  const linkedActivityName = useMemo(() => {
    if (!sourceExecution) return undefined;
    const match = matches.find(
      (item) => item.sessionExecutionId === sourceExecution.id && item.status !== "rejected",
    );
    return match ? activities.find((activity) => activity.id === match.garminActivityId)?.name : undefined;
  }, [sourceExecution, matches, activities]);

  const [useLastLoads, setUseLastLoads] = useState(true);
  const [mode, setMode] = useState<"choose" | "schedule">("choose");
  const [scheduledDate, setScheduledDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (!ready) return <Loading />;

  if (!id || !plannedSession || !sourceExecution) {
    return (
      <EmptyState
        title="No hay nada que repetir"
        description="Esta sesión todavía no tiene una ejecución completada."
        actionLabel="Volver"
        onAction={() => router.back()}
      />
    );
  }

  const handleNow = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await repeatSessionNow(id, sourceExecution.id, useLastLoads);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo repetir la sesión");
      setSaving(false);
    }
  };

  const handleSchedule = async () => {
    if (!DATE_PATTERN.test(scheduledDate)) {
      setError("Ingresa una fecha válida (AAAA-MM-DD)");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await repeatSessionSchedule(id, sourceExecution.id, scheduledDate);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo programar la repetición");
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Repetir sesión", presentation: "modal" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <Text style={styles.summaryEyebrow}>ÚLTIMA VEZ</Text>
          <Text style={styles.summaryTitle}>{plannedSession.title}</Text>
          <Text style={styles.summaryMeta}>
            {formatSantiagoDayLabel(sourceExecution.startedAt)}
            {sourceExecution.actualRpe !== undefined ? ` · RPE ${sourceExecution.actualRpe}` : ""}
          </Text>
          {linkedActivityName ? (
            <Text style={styles.summaryGarmin}>Vinculada a Garmin: {linkedActivityName}</Text>
          ) : null}
        </View>

        {error ? <Notice text={error} tone="error" /> : null}

        {mode === "choose" ? (
          <View style={styles.actions}>
            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={styles.switchLabel}>Usar cargas de la última vez</Text>
                <Text style={styles.switchHint}>
                  Precarga los pesos y reps del último registro; puedes editarlos antes de terminar.
                </Text>
              </View>
              <Switch
                value={useLastLoads}
                onValueChange={setUseLastLoads}
                trackColor={{ false: colors.outlineVariant, true: colors.primaryContainer }}
                thumbColor={useLastLoads ? colors.primary : undefined}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void handleNow()}
              style={styles.primaryButton}
            >
              <Icon role="repeat" size={18} color={colors.onAccent} />
              <Text style={styles.primaryButtonText}>{saving ? "Repitiendo…" : "Entrenar ahora"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => setMode("schedule")}
              style={styles.secondaryButton}
            >
              <Icon role="event" size={18} color={colors.text} />
              <Text style={styles.secondaryButtonText}>Programar para otro día</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actions}>
            <Text style={styles.fieldLabel}>Fecha (AAAA-MM-DD)</Text>
            <TextInput
              value={scheduledDate}
              onChangeText={setScheduledDate}
              placeholder="2026-08-20"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              keyboardType="numbers-and-punctuation"
            />
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void handleSchedule()}
              style={styles.primaryButton}
            >
              <Icon role="event" size={18} color={colors.onAccent} />
              <Text style={styles.primaryButtonText}>{saving ? "Programando…" : "Confirmar fecha"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => setMode("choose")}
              style={styles.ghostButton}
            >
              <Text style={styles.ghostButtonText}>Volver</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  flex: { flex: 1 },

  summary: { gap: spacing.xs, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, padding: spacing.md },
  summaryEyebrow: { ...typography.label, color: colors.textMuted, fontSize: 10, textTransform: "uppercase" },
  summaryTitle: { ...typography.subtitle, color: colors.text },
  summaryMeta: { ...typography.caption, color: colors.textMuted },
  summaryGarmin: { ...typography.caption, color: colors.primary },

  actions: { gap: spacing.md },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  switchLabel: { ...typography.bodyStrong, color: colors.text },
  switchHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  primaryButtonText: { ...typography.bodyStrong, color: colors.onAccent },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: { ...typography.bodyStrong, color: colors.text },
  ghostButton: { minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  ghostButtonText: { ...typography.caption, color: colors.textMuted },

  fieldLabel: { ...typography.label, color: colors.textMuted },
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
});
