import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SessionStatus, TrainingSession } from "@ridelab/shared";
import { useApp } from "../../src/state/AppContext";
import { Badge, Button, Card, EmptyState, Loading, SectionHeader } from "../../src/components/ui";
import { Icon } from "../../src/components/icon";
import {
  countExercises,
  currentWeekNumber,
  getWeek,
  nextSession,
  STATUS_LABEL,
  weekProgress,
} from "../../src/lib/plan";
import { colors, radius, spacing, typography } from "../../src/theme";

/** Sección Entrenamiento: plan activo, semana en curso y sesiones. */
export default function TrainingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, activePlan, sessionStatus } = useApp();

  const week = useMemo(
    () => (activePlan ? getWeek(activePlan, currentWeekNumber(activePlan)) : undefined),
    [activePlan],
  );
  const progress = useMemo(() => weekProgress(week, sessionStatus), [week, sessionStatus]);
  const upcoming = useMemo(
    () => (activePlan ? nextSession(activePlan, sessionStatus) : undefined),
    [activePlan, sessionStatus],
  );

  if (!ready) return <Loading label="Cargando tu plan…" />;

  if (!activePlan) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
        <EmptyState
          title="Todavía no tienes un plan"
          description="Pídele uno al coach en el Chat y aparecerá aquí con todas sus sesiones."
          actionLabel="Ir al Chat"
          onAction={() => router.push("/")}
        />
      </View>
    );
  }

  const completedSessions = activePlan.weeks
    .flatMap((w) => w.sessions)
    .filter((session) => sessionStatus[session.id] === "completed");

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl },
      ]}
    >
      <View style={styles.headerBlock}>
        <Text style={styles.screenTitle}>Entrenamiento</Text>
        <Text style={styles.planTitle}>{activePlan.title}</Text>
        <Text style={styles.planGoal}>{activePlan.goal}</Text>
      </View>

      <Card style={styles.weekCard}>
        <View style={styles.weekHeader}>
          <View style={styles.weekHeaderText}>
            <Text style={styles.weekLabel}>Semana {week?.number ?? 1} de {activePlan.durationWeeks}</Text>
            <Text style={styles.weekObjective}>{week?.objective}</Text>
          </View>
          <Text style={styles.weekCount}>
            {progress.completed}/{progress.total}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress.ratio * 100)}%` }]} />
        </View>
      </Card>

      {upcoming ? (
        <View>
          <SectionHeader title="Próxima sesión" />
          <View style={styles.nextCard}>
            <View style={styles.nextLabelRow}>
              <Icon role="bolt" size={16} color={colors.accentMuted} />
              <Text style={styles.nextLabel}>PRÓXIMA SESIÓN · {upcoming.dayLabel}</Text>
            </View>
            <Text style={styles.nextTitle}>{upcoming.title}</Text>
            <Text style={styles.nextFocus}>{upcoming.focus}</Text>
            <View style={styles.nextMeta}>
              <View style={styles.metaItem}>
                <Icon role="timer" size={16} color={colors.onFeatureCardFaint} />
                <Text style={styles.nextMetaText}>{upcoming.estimatedMinutes} min</Text>
              </View>
              <View style={styles.metaItem}>
                <Icon role="exerciseCount" size={16} color={colors.onFeatureCardFaint} />
                <Text style={styles.nextMetaText}>{countExercises(upcoming)} ejercicios</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/session/${upcoming.id}`)}
              style={styles.nextButton}
            >
              <Text style={styles.nextButtonText}>Ver sesión</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Card>
          <Text style={styles.allDone}>Completaste todas las sesiones del plan. Pídele al coach el siguiente bloque.</Text>
        </Card>
      )}

      <View>
        <SectionHeader title="Sesiones de la semana" hint={`${week?.sessions.length ?? 0} sesiones`} />
        <View style={styles.list}>
          {week?.sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              status={sessionStatus[session.id] ?? "pending"}
              onPress={() => router.push(`/session/${session.id}`)}
            />
          ))}
        </View>
      </View>

      {completedSessions.length > 0 ? (
        <View>
          <SectionHeader title="Completadas" hint={`${completedSessions.length} en total`} />
          <View style={styles.list}>
            {completedSessions.map((session) => (
              <SessionCard
                key={`done-${session.id}`}
                session={session}
                status="completed"
                onPress={() => router.push(`/session/${session.id}`)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

/** Tarjeta de sesión: día, nombre, foco, duración, ejercicios y estado. */
function SessionCard({
  session,
  status,
  onPress,
}: {
  session: TrainingSession;
  status: SessionStatus;
  onPress: () => void;
}) {
  const isCompleted = status === "completed";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.sessionCard,
        isCompleted && styles.sessionCardCompleted,
        !isCompleted && status === "pending" && styles.sessionCardPending,
        pressed && styles.sessionPressed,
      ]}
    >
      <View style={styles.sessionTop}>
        <Text style={styles.sessionDay}>{session.dayLabel}</Text>
        {isCompleted ? (
          <Icon role="checkCircleFilled" size={20} color={colors.primary} />
        ) : (
          <Badge
            text={STATUS_LABEL[status]}
            tone={status === "skipped" ? "warning" : "neutral"}
          />
        )}
      </View>
      <Text style={styles.sessionTitle}>{session.title}</Text>
      <Text style={styles.sessionFocus} numberOfLines={2}>
        {session.focus}
      </Text>
      <View style={styles.sessionMeta}>
        <Icon role="timer" size={14} color={colors.textMuted} />
        <Text style={styles.metaText}>{session.estimatedMinutes} min</Text>
        <Text style={styles.metaDot}>·</Text>
        <Icon role="exerciseCount" size={14} color={colors.textMuted} />
        <Text style={styles.metaText}>{countExercises(session)} ejercicios</Text>
        {!isCompleted ? (
          <View style={styles.trailingIcon}>
            <Icon role="schedule" size={16} color={colors.textFaint} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },

  headerBlock: { gap: spacing.xs },
  screenTitle: { ...typography.display, color: colors.text },
  planTitle: { ...typography.subtitle, color: colors.accent, marginTop: spacing.sm },
  planGoal: { ...typography.body, color: colors.textMuted },

  weekCard: { gap: spacing.md },
  weekHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  // Sin `flex: 1` el objetivo de la semana se sale de la tarjeta en 360-412 px.
  weekHeaderText: { flex: 1 },
  weekLabel: { ...typography.bodyStrong, color: colors.text },
  weekObjective: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  weekCount: { ...typography.title, color: colors.accent },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceContainerHigh, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: 4 },

  nextCard: {
    backgroundColor: colors.featureCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  nextLabelRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  nextLabel: { ...typography.label, color: colors.accentMuted, textTransform: "uppercase" },
  nextTitle: { ...typography.title, color: colors.onFeatureCard },
  nextFocus: { ...typography.body, color: colors.onFeatureCardMuted },
  nextMeta: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginBottom: spacing.sm },
  metaItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  nextMetaText: { ...typography.caption, color: colors.onFeatureCardFaint },
  nextButton: {
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  nextButtonText: { ...typography.bodyStrong, color: colors.onPrimaryContainer },

  allDone: { ...typography.body, color: colors.textMuted },

  list: { gap: spacing.md },
  sessionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  sessionCardCompleted: {
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.surfaceContainer,
    opacity: 0.78,
  },
  sessionCardPending: {
    backgroundColor: colors.surfaceAlt,
    borderLeftWidth: 4,
    borderLeftColor: colors.primaryContainer,
  },
  sessionPressed: { backgroundColor: colors.surfaceAlt },
  sessionTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sessionDay: { ...typography.caption, color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.6 },
  sessionTitle: { ...typography.subtitle, color: colors.text },
  sessionFocus: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
  sessionMeta: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  trailingIcon: { marginLeft: "auto" },

  metaText: { ...typography.caption, color: colors.textMuted },
  metaDot: { ...typography.caption, color: colors.textFaint },
});
