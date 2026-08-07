import React, { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatSantiagoTime } from "@ridelab/shared";
import { useApp } from "../../src/state/AppContext";
import { KeyboardAwareScreen } from "../../src/components/keyboard";
import { Loading, Notice } from "../../src/components/ui";
import { Icon, type IconRole } from "../../src/components/icon";
import { countExercises, nextSession } from "../../src/lib/plan";
import { colors, radius, spacing, TOUCH_TARGET, typography } from "../../src/theme";
import type { PerformanceAssessment, WellnessNote } from "@ridelab/shared";

/** Nivel de assessment → paleta de la tarjeta principal. Recover/insufficient usan el par rojo de M3. */
const DARK_LEVELS = new Set<PerformanceAssessment["level"]>(["push", "solid", "controlled"]);

const LEVEL_ICON: Record<PerformanceAssessment["level"], IconRole> = {
  push: "recoveryGood",
  solid: "recoveryGood",
  controlled: "recoveryWarning",
  recover: "warning",
  insufficient: "info",
};

/** Sección Estado: traduce las métricas Garmin en una recomendación accionable de hoy. */
export default function EstadoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    ready,
    activePlan,
    sessionStatus,
    garminStatus,
    performanceResponse,
    performanceUpdatedAt,
    performanceStatus,
    performanceError,
    refreshPerformance,
    wellnessNotes,
    saveWellnessNote,
  } = useApp();

  useEffect(() => {
    if (!performanceResponse) void refreshPerformance();
    // Sólo al montar si no hay nada persistido — refrescos posteriores son manuales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upcoming = useMemo(
    () => (activePlan ? nextSession(activePlan, sessionStatus) : undefined),
    [activePlan, sessionStatus],
  );

  if (!ready) return <Loading label="Cargando tu estado…" />;

  const { snapshot, assessment, guidance } = performanceResponse ?? {};
  const isDark = assessment ? DARK_LEVELS.has(assessment.level) : true;
  const loading = performanceStatus === "loading";

  return (
    <KeyboardAwareScreen>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void refreshPerformance()} tintColor={colors.accent} colors={[colors.accent]} />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.screenTitle}>Estado</Text>
          <Text style={styles.syncText}>
            {performanceUpdatedAt ? `Actualizado ${formatSantiagoTime(performanceUpdatedAt)}` : "Sin actualizar todavía"}
            {snapshot ? ` · ${snapshot.source === "mock" ? "datos de demostración" : "Garmin conectado"}` : ""}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Actualizar"
          disabled={loading}
          onPress={() => void refreshPerformance()}
          style={[styles.syncButton, loading && styles.syncButtonDisabled]}
        >
          <Icon role="sync" size={22} color={colors.text} />
        </Pressable>
      </View>

      <WellnessNoteCard notes={wellnessNotes} onSave={saveWellnessNote} />

      {garminStatus.status === "demo" ? <Notice text={garminStatus.message} /> : null}
      {performanceError ? <Notice text={performanceError} tone="error" /> : null}
      {loading && !performanceResponse ? <Loading label="Consultando tus métricas…" /> : null}

      {assessment && snapshot ? (
        <>
          <View style={[styles.mainCard, isDark ? styles.mainCardDark : styles.mainCardLight]}>
            <View style={styles.mainCardTop}>
              <View style={styles.levelRow}>
                <Icon role={LEVEL_ICON[assessment.level]} size={20} color={isDark ? colors.primaryFixedDim : colors.onErrorContainer} />
                <Text style={[styles.levelLabel, { color: isDark ? colors.primaryFixedDim : colors.onErrorContainer }]}>
                  {assessment.label.toUpperCase()}
                </Text>
              </View>
              {snapshot.trainingReadiness?.score !== undefined ? (
                <Text style={[styles.readinessScore, { color: isDark ? colors.primaryFixedDim : colors.onErrorContainer }]}>
                  {snapshot.trainingReadiness.score}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.headline, { color: isDark ? colors.onFeatureCard : colors.onErrorContainer }]}>
              {assessment.headline}
            </Text>
            <Text style={[styles.recommendation, { color: isDark ? colors.onFeatureCardMuted : colors.onErrorContainer }]}>
              {assessment.recommendation}
            </Text>

            <View style={styles.metricsGrid}>
              {snapshot.sleep?.durationMinutes !== undefined ? (
                <MetricCell
                  label="Sueño"
                  value={`${Math.floor(snapshot.sleep.durationMinutes / 60)}h ${snapshot.sleep.durationMinutes % 60}m`}
                  dark={isDark}
                />
              ) : null}
              {snapshot.hrv?.status ? <MetricCell label="HRV" value={snapshot.hrv.status} dark={isDark} /> : null}
              {snapshot.bodyBattery?.current !== undefined ? (
                <MetricCell label="Body Battery" value={String(snapshot.bodyBattery.current)} dark={isDark} />
              ) : null}
              {snapshot.recovery?.remainingHours !== undefined ? (
                <MetricCell label="Recuperación" value={`${snapshot.recovery.remainingHours}h`} dark={isDark} />
              ) : null}
            </View>

            <Text style={[styles.dataQualityText, { color: isDark ? colors.onFeatureCardFaint : colors.onErrorContainer }]}>
              Calidad de datos: {DATA_QUALITY_LABEL[assessment.dataQuality]}
            </Text>
          </View>

          {(assessment.positiveDrivers.length > 0 || assessment.cautionDrivers.length > 0) ? (
            <View style={styles.driversSection}>
              <Text style={styles.sectionTitle}>Qué está influyendo</Text>
              {assessment.positiveDrivers.length > 0 ? (
                <View style={styles.driverCard}>
                  <View style={styles.driverHeadRow}>
                    <Icon role="checkCircleFilled" size={18} color={colors.primary} />
                    <Text style={[styles.driverHeadText, { color: colors.primary }]}>A TU FAVOR</Text>
                  </View>
                  {assessment.positiveDrivers.map((driver) => (
                    <DriverRow key={driver} text={driver} />
                  ))}
                </View>
              ) : null}
              {assessment.cautionDrivers.length > 0 ? (
                <View style={styles.driverCard}>
                  <View style={styles.driverHeadRow}>
                    <Icon role="warning" size={18} color={colors.warning} />
                    <Text style={[styles.driverHeadText, { color: colors.warning }]}>PARA CUIDAR</Text>
                  </View>
                  {assessment.cautionDrivers.map((driver) => (
                    <DriverRow key={driver} text={driver} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {snapshot.acuteLoad?.value !== undefined || snapshot.trainingStatus ? (
            <View style={styles.loadSection}>
              <Text style={styles.sectionTitle}>Carga de entrenamiento</Text>
              <View style={styles.loadCard}>
                <View style={styles.loadTopRow}>
                  <Text style={styles.loadLabel}>CARGA AGUDA</Text>
                  <Text style={styles.loadValue}>{snapshot.acuteLoad?.status ?? snapshot.acuteLoad?.value ?? "—"}</Text>
                </View>
                {snapshot.acuteLoad?.optimalLow !== undefined && snapshot.acuteLoad?.optimalHigh !== undefined ? (
                  <Text style={styles.loadRange}>
                    Rango óptimo: {snapshot.acuteLoad.optimalLow}–{snapshot.acuteLoad.optimalHigh}
                  </Text>
                ) : null}
                {snapshot.trainingStatus ? <Text style={styles.loadRange}>Training Status: {snapshot.trainingStatus}</Text> : null}
              </View>
            </View>
          ) : null}

          {guidance ? (
            <View style={styles.coachCard}>
              <View style={styles.coachHeadRow}>
                <Icon role="coach" size={18} color={colors.onSecondaryContainer} />
                <Text style={styles.coachHeadText}>MENSAJE DEL COACH</Text>
              </View>
              <Text style={styles.coachTitle}>Cómo atacar tu semana</Text>
              <Text style={styles.coachBody}>{guidance.weeklyApproach}</Text>
              <Text style={styles.coachBody}>{guidance.nextWorkoutAdvice}</Text>
              <Text style={styles.coachMotivational}>{guidance.motivationalLine}</Text>
            </View>
          ) : null}

          <Pressable accessibilityRole="button" onPress={() => router.push("/estado/all-metrics")} style={styles.allMetricsLink}>
            <Text style={styles.allMetricsLinkText}>Ver todas las métricas</Text>
            <Icon role="chevronRight" size={18} color={colors.accent} />
          </Pressable>
        </>
      ) : null}

      {upcoming ? (
        <View style={styles.nextSection}>
          <Text style={styles.sectionTitle}>Próxima sesión</Text>
          <View style={styles.nextCard}>
            <Text style={styles.nextLabel}>{upcoming.dayLabel.toUpperCase()}</Text>
            <Text style={styles.nextTitle}>{upcoming.title}</Text>
            <Text style={styles.nextMeta}>
              {upcoming.estimatedMinutes} min · {countExercises(upcoming)} ejercicios
            </Text>
            <View style={styles.nextActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/session/${upcoming.id}`)}
                style={styles.nextButtonPrimary}
              >
                <Text style={styles.nextButtonPrimaryText}>Ver sesión</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/")}
                style={styles.nextButtonGhost}
              >
                <Text style={styles.nextButtonGhostText}>Adaptar con el Coach</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </ScrollView>
    </KeyboardAwareScreen>
  );
}

const DATA_QUALITY_LABEL: Record<PerformanceAssessment["dataQuality"], string> = {
  complete: "completa",
  partial: "parcial",
  insufficient: "insuficiente",
};

function MetricCell({ label, value, dark }: { label: string; value: string; dark: boolean }) {
  return (
    <View style={styles.metricCell}>
      <Text style={[styles.metricLabel, { color: dark ? colors.onFeatureCardFaint : colors.onErrorContainer }]}>
        {label.toUpperCase()}
      </Text>
      <Text style={[styles.metricValue, { color: dark ? colors.onFeatureCard : colors.onErrorContainer }]}>{value}</Text>
    </View>
  );
}

/**
 * "Cómo te sientes hoy": nota subjetiva de texto libre, una por día. Se envía
 * al coach (chat y mensaje de Estado) como contexto cualitativo — nunca cambia
 * el nivel calculado, que siempre sale sólo de métricas objetivas.
 */
function WellnessNoteCard({
  notes,
  onSave,
}: {
  notes: WellnessNote[];
  onSave: (date: string, note: string) => Promise<WellnessNote>;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const existing = useMemo(() => notes.find((item) => item.date === today), [notes, today]);
  const [draft, setDraft] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [savedJustNow, setSavedJustNow] = useState(false);

  const dirty = draft.trim() !== (existing?.note ?? "");

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSave(today, trimmed);
      setSavedJustNow(true);
      setTimeout(() => setSavedJustNow(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wellnessCard}>
      <Text style={styles.wellnessLabel}>¿CÓMO TE SIENTES HOY?</Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Piernas pesadas, con energía, dormí mal aunque el reloj diga bien…"
        placeholderTextColor={colors.textFaint}
        style={styles.wellnessInput}
        multiline
      />
      <View style={styles.wellnessFooter}>
        <Text style={styles.wellnessHint}>
          {savedJustNow ? "Guardado — el coach ya lo tiene en cuenta." : "Es texto libre, no una métrica de Garmin."}
        </Text>
        {dirty ? (
          <Pressable
            accessibilityRole="button"
            disabled={saving || !draft.trim()}
            onPress={() => void handleSave()}
            style={[styles.wellnessSaveButton, (saving || !draft.trim()) && styles.wellnessSaveButtonDisabled]}
          >
            <Text style={styles.wellnessSaveButtonText}>{saving ? "Guardando…" : "Guardar"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function DriverRow({ text }: { text: string }) {
  return (
    <View style={styles.driverRow}>
      <View style={styles.driverDot} />
      <Text style={styles.driverText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },

  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  screenTitle: { ...typography.display, color: colors.text },
  syncText: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  syncButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceContainerHighest,
  },
  syncButtonDisabled: { opacity: 0.5 },

  wellnessCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  wellnessLabel: { ...typography.label, color: colors.textMuted, fontSize: 11 },
  wellnessInput: {
    minHeight: 44,
    maxHeight: 110,
    color: colors.text,
    ...typography.body,
    textAlignVertical: "top",
  },
  wellnessFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  wellnessHint: { ...typography.caption, color: colors.textFaint, flex: 1 },
  wellnessSaveButton: {
    minHeight: 36,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  wellnessSaveButtonDisabled: { opacity: 0.5 },
  wellnessSaveButtonText: { ...typography.caption, color: colors.onAccent, fontWeight: "700" },

  mainCard: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  mainCardDark: { backgroundColor: colors.featureCard },
  mainCardLight: { backgroundColor: colors.errorContainer },
  mainCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  levelRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  levelLabel: { ...typography.label },
  readinessScore: { ...typography.display },
  headline: { ...typography.subtitle },
  recommendation: { ...typography.body },

  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  metricCell: { minWidth: "40%", gap: 2 },
  metricLabel: { ...typography.label, fontSize: 11 },
  metricValue: { ...typography.title },

  dataQualityText: { ...typography.caption, marginTop: spacing.xs },

  sectionTitle: { ...typography.subtitle, color: colors.text, marginBottom: spacing.sm },

  driversSection: {},
  driverCard: { backgroundColor: colors.surfaceContainer, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  driverHeadRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  driverHeadText: { ...typography.label, fontSize: 11 },
  driverRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  driverDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.outlineVariant },
  driverText: { ...typography.body, color: colors.text, flex: 1 },

  loadSection: {},
  loadCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  loadTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  loadLabel: { ...typography.label, color: colors.textMuted, fontSize: 11 },
  loadValue: { ...typography.title, color: colors.accent },
  loadRange: { ...typography.caption, color: colors.textMuted },

  coachCard: { backgroundColor: colors.secondaryContainer, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  coachHeadRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  coachHeadText: { ...typography.label, color: colors.onSecondaryContainer, fontSize: 11 },
  coachTitle: { ...typography.bodyStrong, color: colors.onSecondaryContainer },
  coachBody: { ...typography.caption, color: colors.onSecondaryContainer, lineHeight: 18 },
  coachMotivational: { ...typography.bodyStrong, color: colors.onSecondaryContainer, marginTop: spacing.xs },

  allMetricsLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, minHeight: TOUCH_TARGET },
  allMetricsLinkText: { ...typography.bodyStrong, color: colors.accent },

  nextSection: {},
  nextCard: { backgroundColor: colors.featureCard, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  nextLabel: { ...typography.label, color: colors.primaryFixedDim, fontSize: 11 },
  nextTitle: { ...typography.title, color: colors.onFeatureCard },
  nextMeta: { ...typography.caption, color: colors.onFeatureCardFaint, marginBottom: spacing.sm },
  nextActions: { gap: spacing.sm },
  nextButtonPrimary: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    backgroundColor: colors.primaryFixed,
    alignItems: "center",
    justifyContent: "center",
  },
  nextButtonPrimaryText: { ...typography.bodyStrong, color: colors.onPrimaryFixed },
  nextButtonGhost: { minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center" },
  nextButtonGhostText: { ...typography.caption, color: colors.onFeatureCardFaint },
});
