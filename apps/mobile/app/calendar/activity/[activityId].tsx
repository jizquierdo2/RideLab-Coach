import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { formatSantiagoTime, santiagoDayKey } from "@ridelab/shared";
import { useApp } from "../../../src/state/AppContext";
import { EmptyState, Loading } from "../../../src/components/ui";
import { Icon } from "../../../src/components/icon";
import { findPlannedSession } from "../../../src/lib/calendar";
import { colors, radius, spacing, typography } from "../../../src/theme";

/** Detalle de una actividad Garmin: métricas, Training Effect, zonas de FC y estado del vínculo. */
export default function GarminActivityDetailScreen() {
  const { activityId } = useLocalSearchParams<{ activityId: string }>();
  const router = useRouter();
  const { ready, plans, executions, activities, matches } = useApp();

  const activity = activities.find((item) => item.id === activityId);
  const match = matches.find((item) => item.garminActivityId === activityId && item.status !== "rejected");
  const plannedSession = useMemo(() => {
    if (!match) return undefined;
    const execution = executions.find((item) => item.id === match.sessionExecutionId);
    return execution ? findPlannedSession(plans, execution.plannedSessionId) : undefined;
  }, [match, executions, plans]);

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

  const durationMinutes = Math.round(activity.durationSeconds / 60);
  const totalZoneSeconds = activity.heartRateZones?.reduce((sum, zone) => sum + zone.seconds, 0) ?? 0;

  return (
    <>
      <Stack.Screen options={{ title: activity.name }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Icon role="watch" size={22} color={colors.text} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.headerTitle}>{activity.name}</Text>
            <Text style={styles.headerSubtitle}>
              GARMIN · {santiagoDayKey(activity.startedAt)} · {formatSantiagoTime(activity.startedAt)}
            </Text>
          </View>
        </View>

        {plannedSession ? (
          <View style={styles.matchCard}>
            <View style={styles.matchBadgeRow}>
              <View style={styles.matchBadge}>
                <Icon role="checkCircleFilled" size={12} color={colors.onPrimaryContainer} />
                <Text style={styles.matchBadgeText}>GARMIN SYNCED</Text>
              </View>
              <Text style={styles.matchBadgeLabel}>
                {match?.status === "confirmed" ? "VINCULADA CON" : "SUGERIDA PARA"}
              </Text>
            </View>
            <Text style={styles.matchTitle}>{plannedSession.title}</Text>
          </View>
        ) : null}

        <View style={styles.metricsGrid}>
          <Metric label="TIEMPO" value={`${durationMinutes} min`} />
          {activity.calories !== undefined ? <Metric label="CALORÍAS" value={String(activity.calories)} /> : null}
          {activity.averageHeartRate !== undefined ? (
            <Metric label="FC PROM" value={`${activity.averageHeartRate}`} />
          ) : null}
          {activity.maxHeartRate !== undefined ? <Metric label="FC MÁX" value={`${activity.maxHeartRate}`} /> : null}
          {activity.distanceMeters !== undefined ? (
            <Metric label="DISTANCIA" value={`${(activity.distanceMeters / 1000).toFixed(1)} km`} />
          ) : null}
          {activity.elevationGainMeters !== undefined ? (
            <Metric label="DESNIVEL" value={`${activity.elevationGainMeters} m`} />
          ) : null}
        </View>

        {activity.heartRateZones && activity.heartRateZones.length > 0 && totalZoneSeconds > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Zonas de frecuencia cardíaca</Text>
            <View style={styles.zoneBar}>
              {activity.heartRateZones.map((zone) => (
                <View
                  key={zone.zone}
                  style={[
                    styles.zoneSegment,
                    {
                      flex: zone.seconds,
                      backgroundColor: ZONE_COLORS[zone.zone - 1] ?? colors.surfaceVariant,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.zoneLegend}>
              {activity.heartRateZones.map((zone) => (
                <View key={zone.zone} style={styles.zoneLegendItem}>
                  <Text style={styles.zoneLegendLabel}>Z{zone.zone}</Text>
                  <Text style={styles.zoneLegendValue}>{Math.round(zone.seconds / 60)}m</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {activity.aerobicTrainingEffect !== undefined || activity.anaerobicTrainingEffect !== undefined ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Training Effect</Text>
            {activity.aerobicTrainingEffect !== undefined ? (
              <TrainingEffectRow label="AERÓBICO" value={activity.aerobicTrainingEffect} color={colors.primaryFixedDim} />
            ) : null}
            {activity.anaerobicTrainingEffect !== undefined ? (
              <TrainingEffectRow label="ANAERÓBICO" value={activity.anaerobicTrainingEffect} color={colors.secondary} />
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          {plannedSession ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/calendar/match/${activity.id}`)}
              style={styles.secondaryButton}
            >
              <Icon role="tune" size={16} color={colors.textMuted} />
              <Text style={styles.secondaryButtonText}>Cambiar vínculo</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/calendar/match/${activity.id}`)}
              style={styles.primaryButton}
            >
              <Icon role="link" size={18} color={colors.onAccent} />
              <Text style={styles.primaryButtonText}>Vincular a una sesión</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </>
  );
}

const ZONE_COLORS = [colors.surfaceVariant, colors.secondaryFixedDim, colors.primaryFixedDim, colors.tertiary, colors.bad];

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function TrainingEffectRow({ label, value, color }: { label: string; value: number; color: string }) {
  const ratio = Math.min(1, value / 5);
  return (
    <View style={styles.teRow}>
      <View style={styles.teHeadRow}>
        <View style={styles.teHeadLeft}>
          <View style={[styles.teDot, { backgroundColor: color }]} />
          <Text style={styles.teLabel}>{label}</Text>
        </View>
        <Text style={styles.teValue}>{value.toFixed(1)}</Text>
      </View>
      <View style={styles.teTrack}>
        <View style={[styles.teFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  flex: { flex: 1 },

  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { ...typography.title, color: colors.text },
  headerSubtitle: { ...typography.caption, color: colors.textFaint },

  matchCard: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  matchBadgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  matchBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.onPrimaryContainer,
    borderRadius: radius.xs,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  matchBadgeText: { ...typography.label, color: colors.primaryContainer, fontSize: 10 },
  matchBadgeLabel: { ...typography.caption, color: colors.onPrimaryContainer, opacity: 0.7 },
  matchTitle: { ...typography.title, color: colors.onPrimaryContainer },

  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metric: {
    flexBasis: "31%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: "center",
    gap: 2,
  },
  metricLabel: { ...typography.label, color: colors.textMuted, fontSize: 10 },
  metricValue: { ...typography.title, color: colors.text },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: { ...typography.bodyStrong, color: colors.text },

  zoneBar: { flexDirection: "row", height: 20, borderRadius: radius.xs, overflow: "hidden", gap: 1 },
  zoneSegment: { height: "100%" },
  zoneLegend: { flexDirection: "row", justifyContent: "space-between" },
  zoneLegendItem: { alignItems: "center", gap: 2 },
  zoneLegendLabel: { ...typography.caption, color: colors.textMuted },
  zoneLegendValue: { ...typography.caption, color: colors.text, fontWeight: "700" },

  teRow: { gap: spacing.xs },
  teHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  teHeadLeft: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  teDot: { width: 8, height: 8, borderRadius: 4 },
  teLabel: { ...typography.label, color: colors.textMuted, fontSize: 11 },
  teValue: { ...typography.bodyStrong, color: colors.text },
  teTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceContainerHigh, overflow: "hidden" },
  teFill: { height: "100%", borderRadius: 3 },

  actions: { marginTop: spacing.sm },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  primaryButtonText: { ...typography.bodyStrong, color: colors.onAccent },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainer,
  },
  secondaryButtonText: { ...typography.bodyStrong, color: colors.textMuted },
});
