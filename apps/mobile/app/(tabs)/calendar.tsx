import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatSantiagoTime, santiagoDayKey } from "@ridelab/shared";
import { useApp } from "../../src/state/AppContext";
import { Badge, Loading, Notice } from "../../src/components/ui";
import { Icon } from "../../src/components/icon";
import {
  buildCombinedRecords,
  buildDayIndicators,
  chunkIntoWeeks,
  dateKey,
  freeActivities,
  monthGridDays,
} from "../../src/lib/calendar";
import { colors, radius, spacing, TOUCH_TARGET, typography } from "../../src/theme";

const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const SYNC_LABEL: Record<string, string> = {
  idle: "Sin sincronizar",
  syncing: "Sincronizando…",
  synced: "Actualizado",
  offline: "Sin conexión",
  error: "Error al sincronizar",
};

/** Calendario: unifica lo planificado, lo ejecutado y lo sincronizado desde Garmin. */
export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    ready,
    plans,
    executions,
    activities,
    matches,
    garminStatus,
    garminSyncStatus,
    lastGarminSyncAt,
    syncGarminActivities,
  } = useApp();

  const today = useMemo(() => new Date(), []);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => dateKey(today));

  useEffect(() => {
    void syncGarminActivities();
    // Sólo al montar: el resto de los disparadores viven en AppContext.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const records = useMemo(
    () => buildCombinedRecords(plans, executions, activities, matches),
    [plans, executions, activities, matches],
  );
  const unlinked = useMemo(() => freeActivities(activities, matches), [activities, matches]);
  const indicators = useMemo(() => buildDayIndicators(records, unlinked), [records, unlinked]);

  const gridWeeks = useMemo(() => chunkIntoWeeks(monthGridDays(visibleMonth)), [visibleMonth]);

  const dayRecords = records.filter((record) => santiagoDayKey(record.execution.startedAt) === selectedDay);
  const dayFreeActivities = unlinked.filter((activity) => santiagoDayKey(activity.startedAt) === selectedDay);

  const completedThisMonth = records.filter((record) => {
    const day = santiagoDayKey(record.execution.startedAt);
    return day.startsWith(dateKey(visibleMonth).slice(0, 7)) && record.execution.status === "completed";
  }).length;

  if (!ready) return <Loading label="Cargando tu calendario…" />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]}
    >
      <Text style={styles.screenTitle}>Calendario</Text>

      {garminStatus.dataSource === "mock" ? <Notice text={garminStatus.message} /> : null}

      <View style={styles.syncRow}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void syncGarminActivities()}
          disabled={garminSyncStatus === "syncing"}
          style={styles.syncButton}
        >
          <Icon role="sync" size={16} color={colors.accent} />
          <Text style={styles.syncButtonText}>Sincronizar</Text>
        </Pressable>
        <Text style={styles.syncStatusText}>
          {SYNC_LABEL[garminSyncStatus]}
          {lastGarminSyncAt ? ` · ${formatSantiagoTime(lastGarminSyncAt)}` : ""}
        </Text>
      </View>

      <View style={styles.monthHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
          onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
          style={styles.monthNavButton}
        >
          <Icon role="chevronLeft" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
          onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
          style={styles.monthNavButton}
        >
          <Icon role="chevronRight" size={22} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            setSelectedDay(dateKey(today));
          }}
          style={styles.todayButton}
        >
          <Icon role="today" size={16} color={colors.textMuted} />
          <Text style={styles.todayButtonText}>Hoy</Text>
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {gridWeeks.map((week) => (
          <View key={dateKey(week[0])} style={styles.weekRow}>
            {week.map((date) => {
              const key = dateKey(date);
              const inMonth = date.getMonth() === visibleMonth.getMonth();
              const isSelected = key === selectedDay;
              const isToday = key === dateKey(today);
              const day = indicators.get(key);

              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  onPress={() => setSelectedDay(key)}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    !inMonth && styles.dayCellOutOfMonth,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      isSelected && styles.dayNumberSelected,
                      isToday && !isSelected && styles.dayNumberToday,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  <View style={styles.dots}>
                    {day?.hasPlanned ? <View style={[styles.dot, { backgroundColor: colors.primaryContainer }]} /> : null}
                    {day?.hasGarmin ? <View style={[styles.dot, { backgroundColor: colors.secondary }]} /> : null}
                    {day?.isLinked ? (
                      <Icon role="checkCircleFilled" size={10} color={isSelected ? colors.onPrimaryContainer : colors.primary} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <LegendItem color={colors.primaryContainer} label="Planificado" />
        <LegendItem color={colors.secondary} label="Garmin" />
        <LegendItem color={colors.primary} label="Vinculado" icon />
      </View>

      <View style={styles.monthSummary}>
        <Text style={styles.monthSummaryText}>
          {completedThisMonth} {completedThisMonth === 1 ? "sesión completada" : "sesiones completadas"} este mes
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/calendar/day/${selectedDay}`)}
        style={styles.dayHeaderRow}
      >
        <Text style={styles.dayHeaderTitle}>{selectedDay}</Text>
        <Icon role="chevronRight" size={18} color={colors.textFaint} />
      </Pressable>

      {dayRecords.length === 0 && dayFreeActivities.length === 0 ? (
        <Text style={styles.emptyDay}>Sin sesiones ni actividades este día.</Text>
      ) : (
        <View style={styles.dayList}>
          {dayRecords.map((record) => (
            <Pressable
              key={record.execution.id}
              accessibilityRole="button"
              onPress={() => router.push(`/calendar/day/${selectedDay}`)}
              style={styles.dayListItem}
            >
              <Icon role="exerciseCount" size={18} color={colors.text} />
              <View style={styles.dayListItemBody}>
                <Text style={styles.dayListItemTitle}>{record.plannedSession.title}</Text>
                <Text style={styles.dayListItemMeta}>
                  {formatSantiagoTime(record.execution.startedAt)}
                  {record.garminActivity ? ` · vinculada con ${record.garminActivity.name}` : ""}
                </Text>
              </View>
              {record.match?.status === "confirmed" ? <Badge text="Vinculada" tone="good" /> : null}
            </Pressable>
          ))}

          {dayFreeActivities.map((activity) => (
            <Pressable
              key={activity.id}
              accessibilityRole="button"
              onPress={() => router.push(`/calendar/activity/${activity.id}`)}
              style={styles.dayListItem}
            >
              <Icon role="watch" size={18} color={colors.secondary} />
              <View style={styles.dayListItemBody}>
                <Text style={styles.dayListItemTitle}>{activity.name}</Text>
                <Text style={styles.dayListItemMeta}>{formatSantiagoTime(activity.startedAt)} · Garmin</Text>
              </View>
              <Badge text="Sin vincular" tone="warning" />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function LegendItem({ color, label, icon }: { color: string; label: string; icon?: boolean }) {
  return (
    <View style={styles.legendItem}>
      {icon ? (
        <Icon role="checkCircleFilled" size={10} color={color} />
      ) : (
        <View style={[styles.dot, { backgroundColor: color }]} />
      )}
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.md },

  screenTitle: { ...typography.display, color: colors.text },

  syncRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  syncButtonText: { ...typography.caption, color: colors.accent, fontWeight: "700" },
  syncStatusText: { ...typography.caption, color: colors.textFaint },

  monthHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  monthNavButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  monthLabel: { ...typography.title, color: colors.text, flex: 1, textTransform: "capitalize" },
  todayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  todayButtonText: { ...typography.caption, color: colors.textMuted },

  weekdayRow: { flexDirection: "row" },
  weekdayLabel: { flex: 1, textAlign: "center", ...typography.caption, color: colors.textFaint },

  grid: {
    backgroundColor: colors.secondaryContainer,
    borderRadius: radius.md,
    padding: 2,
    gap: 2,
  },
  weekRow: { flexDirection: "row", gap: 2 },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: spacing.xs,
    borderRadius: radius.xs,
  },
  dayCellSelected: { backgroundColor: colors.primaryContainer },
  dayCellOutOfMonth: { opacity: 0.4 },
  dayNumber: { ...typography.caption, color: colors.text },
  dayNumberSelected: { color: colors.onPrimaryContainer, fontWeight: "700" },
  dayNumberToday: { color: colors.accent, fontWeight: "700" },
  dots: { flexDirection: "row", gap: 2, marginTop: 4, minHeight: 8 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },

  legend: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  legendLabel: { ...typography.caption, color: colors.textFaint },

  monthSummary: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  monthSummaryText: { ...typography.caption, color: colors.textMuted },

  dayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  dayHeaderTitle: { ...typography.subtitle, color: colors.text },
  emptyDay: { ...typography.caption, color: colors.textFaint },

  dayList: { gap: spacing.sm },
  dayListItem: {
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
  dayListItemBody: { flex: 1, gap: 2 },
  dayListItemTitle: { ...typography.bodyStrong, color: colors.text },
  dayListItemMeta: { ...typography.caption, color: colors.textMuted },
});
