import React, { useMemo } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { formatSantiagoTime, santiagoDayKey } from "@ridelab/shared";
import { useApp } from "../../../src/state/AppContext";
import { Badge, EmptyState, Loading } from "../../../src/components/ui";
import { Icon } from "../../../src/components/icon";
import { buildCombinedRecords, freeActivities, repeatedFromLabel } from "../../../src/lib/calendar";
import { colors, radius, spacing, typography } from "../../../src/theme";

const WEEKDAY_LABELS = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
];

function formatDayTitle(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const local = new Date(year, month - 1, day);
  return `${WEEKDAY_LABELS[local.getDay()]} ${local.getDate()}`;
}

/** Línea de tiempo del día: sesión iniciada en la app, actividad Garmin y su relación. */
export default function DayDetailScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const router = useRouter();
  const { ready, plans, executions, activities, matches, unlinkMatch } = useApp();

  const records = useMemo(
    () => buildCombinedRecords(plans, executions, activities, matches),
    [plans, executions, activities, matches],
  );
  const unlinked = useMemo(() => freeActivities(activities, matches), [activities, matches]);

  const dayRecords = date ? records.filter((record) => santiagoDayKey(record.execution.startedAt) === date) : [];
  const dayUnlinked = date ? unlinked.filter((activity) => santiagoDayKey(activity.startedAt) === date) : [];

  if (!ready) return <Loading />;
  if (!date) return null;

  const hasContent = dayRecords.length > 0 || dayUnlinked.length > 0;

  return (
    <>
      <Stack.Screen options={{ title: formatDayTitle(date) }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{formatDayTitle(date)}</Text>
          {dayRecords.some((record) => record.execution.status === "completed") ? (
            <Badge text="Completado" tone="good" />
          ) : null}
        </View>

        {!hasContent ? (
          <EmptyState title="Sin actividad este día" description="No hay sesiones ni actividades de Garmin registradas." />
        ) : (
          <View style={styles.timeline}>
            {dayRecords.map((record) => (
              <View key={record.execution.id} style={styles.timelineGroup}>
                <TimelineCard
                  icon="exerciseCount"
                  eyebrow="SESIÓN APP"
                  time={formatSantiagoTime(record.execution.startedAt)}
                  title={record.plannedSession.title}
                  meta={`${record.plannedSession.plannedDurationMinutes} min planificados${
                    record.execution.actualRpe ? ` · RPE ${record.execution.actualRpe}` : ""
                  }`}
                  onPress={() => router.push(`/session/${record.plannedSession.id}`)}
                />

                {repeatedFromLabel(record.execution, executions) ? (
                  <Text style={styles.repeatedLabel}>{repeatedFromLabel(record.execution, executions)}</Text>
                ) : null}

                {record.garminActivity ? (
                  <>
                    <View style={styles.linkRow}>
                      <View style={styles.linkLine} />
                      <Icon role="link" size={16} color={colors.primary} />
                      <Text style={styles.linkLabel}>
                        {record.match?.status === "confirmed" ? "VINCULADO" : "SUGERIDO"}
                      </Text>
                    </View>
                    <TimelineCard
                      icon="watch"
                      eyebrow="GARMIN SYNC"
                      time={formatSantiagoTime(record.garminActivity.startedAt)}
                      title={record.garminActivity.name}
                      meta={[
                        `${Math.round(record.garminActivity.durationSeconds / 60)} min`,
                        record.garminActivity.averageHeartRate ? `${record.garminActivity.averageHeartRate} ppm` : undefined,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      onPress={() => router.push(`/calendar/activity/${record.garminActivity!.id}`)}
                      highlight
                    />
                    <View style={styles.recordActions}>
                      {record.match?.status === "suggested" ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => router.push(`/calendar/match/${record.garminActivity!.id}`)}
                          style={styles.actionButton}
                        >
                          <Text style={styles.actionButtonText}>Confirmar vínculo</Text>
                        </Pressable>
                      ) : (
                        <>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => router.push(`/calendar/match/${record.garminActivity!.id}`)}
                            style={styles.actionButton}
                          >
                            <Icon role="tune" size={14} color={colors.textMuted} />
                            <Text style={styles.actionButtonText}>Cambiar vínculo</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() =>
                              confirmUnlink(
                                record.garminActivity!.name,
                                () => void unlinkMatch(record.execution.id, record.garminActivity!.id),
                              )
                            }
                            style={styles.actionButtonDanger}
                          >
                            <Icon role="linkOff" size={14} color={colors.bad} />
                            <Text style={styles.actionButtonDangerText}>Desvincular</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  </>
                ) : null}
              </View>
            ))}

            {dayUnlinked.map((activity) => (
              <View key={activity.id} style={styles.timelineGroup}>
                <TimelineCard
                  icon="watch"
                  eyebrow="GARMIN · SIN VINCULAR"
                  time={formatSantiagoTime(activity.startedAt)}
                  title={activity.name}
                  meta={`${Math.round(activity.durationSeconds / 60)} min`}
                  onPress={() => router.push(`/calendar/activity/${activity.id}`)}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/calendar/match/${activity.id}`)}
                  style={styles.actionButton}
                >
                  <Icon role="link" size={14} color={colors.accent} />
                  <Text style={styles.actionButtonText}>Vincular a una sesión</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

/** Desvincular borra la relación con Garmin, así que se confirma antes. */
function confirmUnlink(activityName: string, onConfirm: () => void) {
  Alert.alert(
    "¿Desvincular esta actividad?",
    `"${activityName}" dejará de estar asociada a esta sesión. Puedes volver a vincularla después.`,
    [
      { text: "Cancelar", style: "cancel" },
      { text: "Desvincular", style: "destructive", onPress: onConfirm },
    ],
  );
}

function TimelineCard({
  icon,
  eyebrow,
  time,
  title,
  meta,
  onPress,
  highlight,
}: {
  icon: "exerciseCount" | "watch";
  eyebrow: string;
  time: string;
  title: string;
  meta: string;
  onPress: () => void;
  highlight?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.card, highlight && styles.cardHighlight]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardEyebrowRow}>
          <Icon role={icon} size={14} color={highlight ? colors.primary : colors.textMuted} />
          <Text style={[styles.cardEyebrow, highlight && { color: colors.primary }]}>{eyebrow}</Text>
        </View>
        <Text style={styles.cardTime}>{time}</Text>
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardMeta}>{meta}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { ...typography.display, color: colors.text },

  timeline: { gap: spacing.xs },
  timelineGroup: { gap: spacing.xs, marginBottom: spacing.md },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  cardHighlight: { backgroundColor: colors.surfaceContainerLow, borderColor: colors.primaryContainer },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardEyebrowRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  cardEyebrow: { ...typography.label, color: colors.textMuted, fontSize: 11 },
  cardTime: { ...typography.caption, color: colors.textFaint },
  cardTitle: { ...typography.bodyStrong, color: colors.text },
  cardMeta: { ...typography.caption, color: colors.textMuted },

  repeatedLabel: { ...typography.caption, color: colors.textFaint, paddingLeft: spacing.lg },

  linkRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingLeft: spacing.lg },
  linkLine: { width: 16, height: 1, backgroundColor: colors.primaryContainer },
  linkLabel: { ...typography.label, color: colors.primary, fontSize: 10 },

  recordActions: { flexDirection: "row", gap: spacing.md, paddingLeft: spacing.lg },
  actionButton: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xs },
  actionButtonText: { ...typography.caption, color: colors.accent, fontWeight: "700" },
  actionButtonDanger: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xs },
  actionButtonDangerText: { ...typography.caption, color: colors.bad, fontWeight: "700" },
});
