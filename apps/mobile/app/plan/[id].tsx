import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useApp } from "../../src/state/AppContext";
import { Badge, Card, EmptyState, Loading, SectionHeader } from "../../src/components/ui";
import { Icon } from "../../src/components/icon";
import { countExercises, STATUS_LABEL } from "../../src/lib/plan";
import { colors, radius, spacing, typography } from "../../src/theme";

/** Vista completa del plan: todas las semanas con sus sesiones. */
export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { ready, plans, sessionStatus, activePlan, setActivePlan } = useApp();

  const plan = useMemo(() => plans.find((candidate) => candidate.id === id), [plans, id]);

  if (!ready) return <Loading />;

  if (!plan) {
    return (
      <EmptyState
        title="Plan no disponible"
        description="Este plan aún no está guardado. Guárdalo desde el chat para poder abrirlo."
        actionLabel="Volver"
        onAction={() => router.back()}
      />
    );
  }

  const isActive = activePlan?.id === plan.id;

  return (
    <>
      <Stack.Screen options={{ title: "Plan" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerBlock}>
          <Text style={styles.title}>{plan.title}</Text>
          <Text style={styles.goal}>{plan.goal}</Text>
          <View style={styles.badges}>
            <Badge text={`${plan.durationWeeks} semanas`} tone="accent" />
            <Badge text={`${plan.daysPerWeek} días/sem`} />
            <Badge text={`${plan.sessionDurationMinutes} min`} />
            {isActive ? <Badge text="Activo" tone="good" /> : null}
          </View>
        </View>

        {plan.sourceContext.equipment.length > 0 ? (
          <Card tone="alt" style={styles.contextCard}>
            <Text style={styles.contextLabel}>Equipamiento considerado</Text>
            <Text style={styles.contextText}>{plan.sourceContext.equipment.join(" · ")}</Text>
            {plan.sourceContext.garminPeriod ? (
              <>
                <Text style={styles.contextLabel}>Datos usados</Text>
                <Text style={styles.contextText}>{plan.sourceContext.garminPeriod}</Text>
              </>
            ) : null}
          </Card>
        ) : null}

        {!isActive ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void setActivePlan(plan.id)}
            style={styles.activateButton}
          >
            <Text style={styles.activateText}>Activar este plan</Text>
          </Pressable>
        ) : null}

        {plan.weeks.map((week) => (
          <View key={week.number}>
            <SectionHeader title={`Semana ${week.number}`} hint={week.objective} />
            <View style={styles.list}>
              {week.sessions.map((session) => (
                <Pressable
                  key={session.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/session/${session.id}`)}
                  style={({ pressed }) => [styles.sessionRow, pressed && styles.sessionPressed]}
                >
                  <View style={styles.sessionInfo}>
                    <Text style={styles.sessionDay}>{session.dayLabel}</Text>
                    <Text style={styles.sessionTitle}>{session.title}</Text>
                    <Text style={styles.sessionMeta}>
                      {session.estimatedMinutes} min · {countExercises(session)} ejercicios
                    </Text>
                  </View>
                  <View style={styles.sessionTrailing}>
                    <Badge
                      text={STATUS_LABEL[sessionStatus[session.id] ?? "pending"]}
                      tone={sessionStatus[session.id] === "completed" ? "good" : "neutral"}
                    />
                    <Icon role="chevronRight" size={20} color={colors.textFaint} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },

  headerBlock: { gap: spacing.sm },
  title: { ...typography.display, color: colors.text },
  goal: { ...typography.body, color: colors.textMuted },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },

  contextCard: { gap: spacing.xs },
  contextLabel: { ...typography.caption, color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.6 },
  contextText: { ...typography.body, color: colors.text },

  activateButton: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  activateText: { ...typography.bodyStrong, color: colors.accent },

  list: { gap: spacing.sm },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sessionPressed: { backgroundColor: colors.surfaceAlt },
  sessionTrailing: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sessionInfo: { flex: 1, gap: 2 },
  sessionDay: { ...typography.caption, color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.6 },
  sessionTitle: { ...typography.bodyStrong, color: colors.text },
  sessionMeta: { ...typography.caption, color: colors.textMuted },
});
