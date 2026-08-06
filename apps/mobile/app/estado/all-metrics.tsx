import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { formatSantiagoTime } from "@ridelab/shared";
import { useApp } from "../../src/state/AppContext";
import { EmptyState, Loading } from "../../src/components/ui";
import { Icon, type IconRole } from "../../src/components/icon";
import { colors, radius, spacing, typography } from "../../src/theme";

/** Todas las métricas de Estado, con baseline, tendencia y fuente — sin saturar la principal. */
export default function AllMetricsScreen() {
  const router = useRouter();
  const { ready, performanceResponse } = useApp();

  if (!ready) return <Loading />;
  const snapshot = performanceResponse?.snapshot;

  if (!snapshot) {
    return (
      <EmptyState
        title="Todavía no hay métricas"
        description="Vuelve a Estado y toca Actualizar."
        actionLabel="Volver"
        onAction={() => router.back()}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Todas las métricas" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Vista completa de tu estado fisiológico actual, sincronizada vía Garmin.
        </Text>

        <View style={styles.list}>
          {snapshot.trainingReadiness ? (
            <MetricRow
              icon="recoveryGood"
              label="Training Readiness"
              value={snapshot.trainingReadiness.score !== undefined ? String(snapshot.trainingReadiness.score) : "—"}
              status={snapshot.trainingReadiness.status}
              source={snapshot.source}
            />
          ) : null}

          {snapshot.sleep ? (
            <MetricRow
              icon="sleep"
              label="Sueño"
              value={
                snapshot.sleep.durationMinutes !== undefined
                  ? `${Math.floor(snapshot.sleep.durationMinutes / 60)}h ${snapshot.sleep.durationMinutes % 60}m${
                      snapshot.sleep.score !== undefined ? ` (${snapshot.sleep.score})` : ""
                    }`
                  : "—"
              }
              baseline={
                snapshot.sleep.baselineDurationMinutes !== undefined
                  ? `Baseline: ${Math.floor(snapshot.sleep.baselineDurationMinutes / 60)}h ${snapshot.sleep.baselineDurationMinutes % 60}m`
                  : undefined
              }
              status={snapshot.sleep.status}
              source={snapshot.source}
            />
          ) : null}

          {snapshot.hrv ? (
            <MetricRow
              icon="heartRate"
              label="HRV"
              value={snapshot.hrv.overnightAverage !== undefined ? `${snapshot.hrv.overnightAverage} ms` : "—"}
              baseline={
                snapshot.hrv.baselineLow !== undefined && snapshot.hrv.baselineHigh !== undefined
                  ? `Baseline: ${snapshot.hrv.baselineLow}-${snapshot.hrv.baselineHigh} ms`
                  : undefined
              }
              status={snapshot.hrv.status}
              source={snapshot.source}
            />
          ) : null}

          {snapshot.bodyBattery ? (
            <MetricRow
              icon="recoveryGood"
              label="Body Battery"
              value={snapshot.bodyBattery.current !== undefined ? `${snapshot.bodyBattery.current}/100` : "—"}
              baseline={
                snapshot.bodyBattery.chargedDuringSleep !== undefined
                  ? `Cargado en el sueño: +${snapshot.bodyBattery.chargedDuringSleep}`
                  : undefined
              }
              source={snapshot.source}
            />
          ) : null}

          {snapshot.restingHeartRate ? (
            <MetricRow
              icon="heartRate"
              label="FC en reposo"
              value={snapshot.restingHeartRate.value !== undefined ? `${snapshot.restingHeartRate.value} bpm` : "—"}
              baseline={
                snapshot.restingHeartRate.baseline !== undefined
                  ? `Baseline: ${snapshot.restingHeartRate.baseline} bpm`
                  : undefined
              }
              source={snapshot.source}
            />
          ) : null}

          {snapshot.stress ? (
            <MetricRow
              icon="warning"
              label="Estrés"
              value={snapshot.stress.average !== undefined ? String(snapshot.stress.average) : "—"}
              status={snapshot.stress.status}
              source={snapshot.source}
            />
          ) : null}

          {snapshot.recovery ? (
            <MetricRow
              icon="timer"
              label="Tiempo de recuperación"
              value={snapshot.recovery.remainingHours !== undefined ? `${snapshot.recovery.remainingHours}h` : "—"}
              source={snapshot.source}
            />
          ) : null}

          {snapshot.acuteLoad ? (
            <MetricRow
              icon="exerciseCount"
              label="Carga aguda"
              value={snapshot.acuteLoad.value !== undefined ? String(snapshot.acuteLoad.value) : "—"}
              baseline={
                snapshot.acuteLoad.optimalLow !== undefined && snapshot.acuteLoad.optimalHigh !== undefined
                  ? `Rango óptimo: ${snapshot.acuteLoad.optimalLow}-${snapshot.acuteLoad.optimalHigh}`
                  : undefined
              }
              status={snapshot.acuteLoad.status}
              source={snapshot.source}
            />
          ) : null}

          {snapshot.trainingStatus ? (
            <MetricRow icon="bolt" label="Training Status" value={snapshot.trainingStatus} source={snapshot.source} />
          ) : null}

          {snapshot.vo2Max ? (
            <MetricRow
              icon="heartRate"
              label="VO2 Max"
              value={snapshot.vo2Max.value !== undefined ? String(snapshot.vo2Max.value) : "—"}
              trend={snapshot.vo2Max.trend}
              source={snapshot.source}
            />
          ) : null}

          {snapshot.intensityMinutes !== undefined ? (
            <MetricRow icon="bolt" label="Minutos de intensidad" value={String(snapshot.intensityMinutes)} source={snapshot.source} />
          ) : null}
        </View>

        {snapshot.missingMetrics.length > 0 ? (
          <View style={styles.missingCard}>
            <Text style={styles.missingTitle}>No disponibles ahora</Text>
            <Text style={styles.missingText}>{snapshot.missingMetrics.join(", ")}</Text>
          </View>
        ) : null}

        <Text style={styles.capturedAt}>Capturado: {formatSantiagoTime(snapshot.capturedAt)} hora de Santiago</Text>
      </ScrollView>
    </>
  );
}

const TREND_ICON: Record<"up" | "stable" | "down", IconRole> = {
  up: "trendingUp",
  stable: "trendingFlat",
  down: "trendingDown",
};

function MetricRow({
  icon,
  label,
  value,
  baseline,
  status,
  trend,
  source,
}: {
  icon: IconRole;
  label: string;
  value: string;
  baseline?: string;
  status?: string;
  trend?: "up" | "stable" | "down";
  source: "garmin" | "mock";
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.rowLabelGroup}>
          <Icon role={icon} size={18} color={colors.textMuted} />
          <Text style={styles.rowLabel}>{label.toUpperCase()}</Text>
        </View>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      <View style={styles.rowBottom}>
        <View style={styles.rowBottomLeft}>
          {baseline ? <Text style={styles.rowBaseline}>{baseline}</Text> : null}
          {status ? (
            <View style={styles.rowStatusRow}>
              {trend ? <Icon role={TREND_ICON[trend]} size={14} color={colors.primary} /> : null}
              <Text style={styles.rowStatus}>{status}</Text>
            </View>
          ) : trend ? (
            <View style={styles.rowStatusRow}>
              <Icon role={TREND_ICON[trend]} size={14} color={colors.primary} />
            </View>
          ) : null}
        </View>
        <View style={styles.rowSource}>
          <Icon role="watch" size={12} color={colors.textFaint} />
          <Text style={styles.rowSourceText}>{source === "mock" ? "DEMO" : "GARMIN"}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  intro: { ...typography.body, color: colors.textMuted },

  list: { gap: spacing.sm },
  row: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowLabelGroup: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  rowLabel: { ...typography.label, color: colors.textMuted, fontSize: 11 },
  rowValue: { ...typography.title, color: colors.text },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  rowBottomLeft: { gap: 2 },
  rowBaseline: { ...typography.caption, color: colors.textMuted },
  rowStatusRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowStatus: { ...typography.caption, color: colors.primary, fontSize: 12 },
  rowSource: { flexDirection: "row", alignItems: "center", gap: 4, opacity: 0.6 },
  rowSourceText: { ...typography.caption, color: colors.textFaint, fontSize: 10 },

  missingCard: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  missingTitle: { ...typography.label, color: colors.textMuted },
  missingText: { ...typography.caption, color: colors.textFaint },

  capturedAt: { ...typography.caption, color: colors.textFaint, textAlign: "center" },
});
