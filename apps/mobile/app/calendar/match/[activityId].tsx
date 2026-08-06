import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { formatSantiagoTime } from "@ridelab/shared";
import { useApp } from "../../../src/state/AppContext";
import { EmptyState, Loading, Notice } from "../../../src/components/ui";
import { Icon } from "../../../src/components/icon";
import { findPlannedSession } from "../../../src/lib/calendar";
import { colors, radius, spacing, TOUCH_TARGET, typography } from "../../../src/theme";

/**
 * Una sola pantalla para los dos flujos de vínculo:
 * - Si ya existe un match "suggested" para esta actividad: confirmación (Sí / No corresponde / Elegir otra).
 * - Si no hay match, o el usuario eligió "otra actividad": selector manual de sesión candidata.
 */
export default function MatchScreen() {
  const { activityId } = useLocalSearchParams<{ activityId: string }>();
  const router = useRouter();
  const { ready, plans, executions, activities, matches, confirmMatch, rejectMatch } = useApp();

  const activity = activities.find((item) => item.id === activityId);
  const suggestedMatch = matches.find((item) => item.garminActivityId === activityId && item.status === "suggested");
  const [mode, setMode] = useState<"confirm" | "manual">(suggestedMatch ? "confirm" : "manual");
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const suggestedPlannedSession = useMemo(() => {
    if (!suggestedMatch) return undefined;
    const execution = executions.find((item) => item.id === suggestedMatch.sessionExecutionId);
    return execution ? { execution, plannedSession: findPlannedSession(plans, execution.plannedSessionId) } : undefined;
  }, [suggestedMatch, executions, plans]);

  const confirmedExecutionIds = useMemo(
    () => new Set(matches.filter((match) => match.status === "confirmed").map((match) => match.sessionExecutionId)),
    [matches],
  );

  const candidates = useMemo(
    () =>
      executions
        .filter((execution) => !confirmedExecutionIds.has(execution.id))
        .map((execution) => ({ execution, plannedSession: findPlannedSession(plans, execution.plannedSessionId) }))
        .filter((candidate): candidate is { execution: typeof candidate.execution; plannedSession: NonNullable<typeof candidate.plannedSession> } =>
          Boolean(candidate.plannedSession),
        ),
    [executions, confirmedExecutionIds, plans],
  );

  if (!ready) return <Loading />;
  if (!activity) {
    return (
      <EmptyState
        title="No encuentro esa actividad"
        description="Puede que ya no esté sincronizada."
        actionLabel="Volver"
        onAction={() => router.back()}
      />
    );
  }

  const handleConfirmSuggested = async () => {
    if (!suggestedMatch) return;
    setSaving(true);
    setError(undefined);
    try {
      await confirmMatch(suggestedMatch.sessionExecutionId, activity.id, "automatic");
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar el vínculo");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!suggestedMatch) return;
    setSaving(true);
    setError(undefined);
    try {
      await rejectMatch(suggestedMatch.sessionExecutionId, activity.id);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descartar la sugerencia");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmManual = async () => {
    if (!selectedExecutionId) {
      router.back();
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await confirmMatch(selectedExecutionId, activity.id, "manual");
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo vincular");
    } finally {
      setSaving(false);
    }
  };

  if (mode === "confirm" && suggestedMatch && suggestedPlannedSession?.plannedSession) {
    const { plannedSession, execution } = suggestedPlannedSession;
    return (
      <>
        <Stack.Screen options={{ title: "Confirmar vínculo", presentation: "modal" }} />
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <View style={styles.confirmHeader}>
            <View style={styles.confirmIcon}>
              <Icon role="sync" size={24} color={colors.onPrimaryContainer} />
            </View>
            <Text style={styles.confirmTitle}>Encontramos tu entrenamiento</Text>
            <Text style={styles.confirmSubtitle}>¿Es esta la actividad que realizaste?</Text>
          </View>

          <View style={styles.comparisonGrid}>
            <View style={styles.comparisonCol}>
              <View style={styles.comparisonEyebrowRow}>
                <Icon role="exerciseCount" size={14} color={colors.textMuted} />
                <Text style={styles.comparisonEyebrow}>PLANIFICADO</Text>
              </View>
              <Text style={styles.comparisonTitle}>{plannedSession.title}</Text>
              <Text style={styles.comparisonTime}>{formatSantiagoTime(execution.startedAt)}</Text>
              <Text style={styles.comparisonMeta}>{plannedSession.plannedDurationMinutes} min</Text>
            </View>
            <View style={styles.comparisonCol}>
              <View style={styles.comparisonEyebrowRow}>
                <Icon role="watch" size={14} color={colors.primary} />
                <Text style={[styles.comparisonEyebrow, { color: colors.primary }]}>GARMIN</Text>
              </View>
              <Text style={styles.comparisonTitle}>{activity.name}</Text>
              <Text style={styles.comparisonTime}>{formatSantiagoTime(activity.startedAt)}</Text>
              <Text style={styles.comparisonMeta}>{Math.round(activity.durationSeconds / 60)} min</Text>
            </View>
          </View>

          {error ? <Notice text={error} tone="error" /> : null}

          <View style={styles.confirmActions}>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void handleConfirmSuggested()}
              style={styles.primaryButton}
            >
              <Icon role="checkCircleFilled" size={18} color={colors.onPrimaryContainer} />
              <Text style={styles.primaryButtonText}>Sí, vincular</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void handleReject()}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>No corresponde</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => setMode("manual")}
              style={styles.ghostButton}
            >
              <Text style={styles.ghostButtonText}>Elegir otra sesión</Text>
            </Pressable>
          </View>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Vincular actividad", presentation: "modal" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.activitySummary}>
          <View style={styles.activityIcon}>
            <Icon role="watch" size={20} color={colors.onPrimaryContainer} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.activityEyebrow}>ACTIVIDAD GARMIN</Text>
            <Text style={styles.activityTitle}>{activity.name}</Text>
            <Text style={styles.activityMeta}>
              {formatSantiagoTime(activity.startedAt)} · {Math.round(activity.durationSeconds / 60)} min
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>SELECCIONA LA SESIÓN DEL PLAN</Text>

        <View style={styles.candidateList}>
          {candidates.length === 0 ? (
            <Text style={styles.emptyCandidates}>No tienes sesiones iniciadas para vincular todavía.</Text>
          ) : (
            candidates.map(({ execution, plannedSession }) => {
              const selected = selectedExecutionId === execution.id;
              return (
                <Pressable
                  key={execution.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedExecutionId(execution.id)}
                  style={[styles.candidate, selected && styles.candidateSelected]}
                >
                  <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                    {selected ? <View style={styles.radioInner} /> : null}
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.candidateTitle}>{plannedSession.title}</Text>
                    <Text style={styles.candidateMeta}>
                      {formatSantiagoTime(execution.startedAt)} · {plannedSession.plannedDurationMinutes} min
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}

          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedExecutionId === undefined }}
            onPress={() => setSelectedExecutionId(undefined)}
            style={[styles.candidate, selectedExecutionId === undefined && styles.candidateSelected]}
          >
            <View style={[styles.radioOuter, selectedExecutionId === undefined && styles.radioOuterSelected]}>
              {selectedExecutionId === undefined ? <View style={styles.radioInner} /> : null}
            </View>
            <Text style={styles.candidateTitle}>No vincular a ninguna sesión</Text>
          </Pressable>
        </View>

        {error ? <Notice text={error} tone="error" /> : null}

        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={() => void handleConfirmManual()}
          style={styles.primaryButtonFull}
        >
          <Text style={styles.primaryButtonFullText}>{selectedExecutionId ? "Confirmar vínculo" : "Cerrar"}</Text>
          {selectedExecutionId ? <Icon role="link" size={18} color={colors.onAccent} /> : null}
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  flex: { flex: 1 },

  confirmHeader: { alignItems: "center", gap: spacing.xs },
  confirmIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  confirmTitle: { ...typography.title, color: colors.text, textAlign: "center" },
  confirmSubtitle: { ...typography.body, color: colors.textMuted, textAlign: "center" },

  comparisonGrid: { flexDirection: "row", gap: 1, backgroundColor: colors.surfaceContainerHigh, borderRadius: radius.md, overflow: "hidden" },
  comparisonCol: { flex: 1, backgroundColor: colors.surface, padding: spacing.md, gap: spacing.xs },
  comparisonEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  comparisonEyebrow: { ...typography.label, color: colors.textMuted, fontSize: 10 },
  comparisonTitle: { ...typography.bodyStrong, color: colors.text },
  comparisonTime: { ...typography.caption, color: colors.textFaint },
  comparisonMeta: { ...typography.caption, color: colors.textMuted },

  confirmActions: { gap: spacing.sm },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.primaryContainer,
  },
  primaryButtonText: { ...typography.bodyStrong, color: colors.onPrimaryContainer },
  secondaryButton: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { ...typography.bodyStrong, color: colors.text },
  ghostButton: { minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  ghostButtonText: { ...typography.caption, color: colors.textMuted },

  activitySummary: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceContainerLow, borderRadius: radius.md, padding: spacing.md },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  activityEyebrow: { ...typography.label, color: colors.outline, fontSize: 10, textTransform: "uppercase" },
  activityTitle: { ...typography.bodyStrong, color: colors.text },
  activityMeta: { ...typography.caption, color: colors.textMuted },

  sectionLabel: { ...typography.label, color: colors.textMuted, fontSize: 11 },

  candidateList: { gap: spacing.sm },
  candidate: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: TOUCH_TARGET,
  },
  candidateSelected: { borderColor: colors.primary, backgroundColor: colors.surfaceContainerLow },
  candidateTitle: { ...typography.bodyStrong, color: colors.text },
  candidateMeta: { ...typography.caption, color: colors.textMuted },
  emptyCandidates: { ...typography.caption, color: colors.textFaint },

  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: { borderColor: colors.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },

  primaryButtonFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  primaryButtonFullText: { ...typography.bodyStrong, color: colors.onAccent },
});
