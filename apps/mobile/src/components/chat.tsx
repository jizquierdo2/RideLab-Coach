import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ChatMessage, CoachAnalysis, PlanProposal } from "@ridelab/shared";
import { Badge, Button, Card, MetricChip } from "./ui";
import { Icon, type IconRole } from "./icon";
import { colors, featureCardToneColor, radius, spacing, typography } from "../theme";

/** Formatea una marca ISO como "hoy 08:14" o "04 ago 08:14". */
function formatSync(iso: string | undefined): string {
  if (!iso) return "sin fecha";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "sin fecha";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `hoy ${time}`;
  return `${date.toLocaleDateString("es-CL", { day: "2-digit", month: "short" })} ${time}`;
}

/** Turno del usuario. */
export function UserBubble({ text }: { text: string }) {
  return (
    <View style={styles.userRow}>
      <View style={styles.userBubble}>
        <Text style={styles.userText}>{text}</Text>
      </View>
    </View>
  );
}

type Tone = "good" | "warning" | "bad";

/** El tono más severo presente entre los chips de métrica, para colorear la tarjeta de énfasis. */
function dominantTone(analysis: CoachAnalysis): Tone {
  const tones = analysis.metrics.map((m) => m.tone);
  if (tones.includes("bad")) return "bad";
  if (tones.includes("warning")) return "warning";
  return "good";
}

const RECOMMENDATION_ICON: Record<Tone, IconRole> = {
  good: "checkCircleFilled",
  warning: "trendingDown",
  bad: "warning",
};

/**
 * Respuesta analítica del coach.
 *
 * Renderiza en bloques separados lo que la especificación exige distinguir:
 * conclusión, métricas, interpretación, recomendación y procedencia del dato.
 * El headline vive en una tarjeta de énfasis (grafito); todo lo demás queda
 * sobre superficies claras para no mezclar dos niveles de contraste.
 */
export function CoachAnalysisCard({ analysis }: { analysis: CoachAnalysis }) {
  const tone = dominantTone(analysis);

  return (
    <View style={styles.coachWrap}>
      <View style={styles.coachIdentity}>
        <View style={styles.coachAvatar}>
          <Icon role="coach" size={16} color={colors.primary} />
        </View>
        <Text style={styles.coachName}>Coach</Text>
      </View>

      <View style={styles.featureCard}>
        <View style={styles.featureHeadRow}>
          <View style={[styles.toneDot, { backgroundColor: featureCardToneColor[tone] }]} />
          <Text style={styles.headline}>{analysis.headline}</Text>
        </View>
      </View>

      {analysis.metrics.length > 0 ? (
        <View style={styles.chips}>
          {analysis.metrics.map((metric) => (
            <MetricChip key={metric.label} label={metric.label} value={metric.value} tone={metric.tone} />
          ))}
        </View>
      ) : null}

      {analysis.interpretation ? (
        <Card style={styles.block}>
          <Text style={styles.blockLabel}>Interpretación</Text>
          <Text style={styles.blockText}>{analysis.interpretation}</Text>
        </Card>
      ) : null}

      {analysis.recommendation ? (
        <View style={styles.recommendationRow}>
          <Icon role={RECOMMENDATION_ICON[tone]} size={20} color={colors.primary} />
          <Text style={styles.recommendationText}>{analysis.recommendation}</Text>
        </View>
      ) : null}

      {analysis.unavailableMetrics.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>Sin datos</Text>
          <Text style={styles.unavailable}>{analysis.unavailableMetrics.join(" · ")}</Text>
        </View>
      ) : null}

      <View style={styles.provenance}>
        <Icon role="info" size={12} color={colors.textFaint} />
        <Text style={styles.provenanceText}>
          {analysis.period ? `Periodo: ${analysis.period}` : "Periodo no declarado"} · Actualizado:{" "}
          {formatSync(analysis.lastSyncAt)}
        </Text>
      </View>
    </View>
  );
}

/** Tarjeta de plan propuesto dentro del chat. */
export function PlanProposalCard({
  proposal,
  saved,
  onSave,
  onView,
  onAdjust,
}: {
  proposal: PlanProposal;
  saved: boolean;
  onSave: () => void;
  onView: () => void;
  onAdjust: () => void;
}) {
  const { plan } = proposal;
  const firstWeekSessions = plan.weeks[0]?.sessions ?? [];

  return (
    <Card style={styles.planCard}>
      <View style={styles.planHeaderRow}>
        <View style={styles.planIconBox}>
          <Icon role="exerciseCount" size={24} color={colors.text} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.planTitle}>{plan.title}</Text>
          <View style={styles.planBadges}>
            <Badge text={plan.sport} />
            {!saved ? <Badge text="NUEVO" tone="accent" /> : null}
          </View>
        </View>
      </View>

      <Text style={styles.planGoal}>{plan.goal}</Text>

      <View style={styles.planFacts}>
        <PlanFact label="Duración" value={`${plan.durationWeeks} semanas`} />
        <PlanFact label="Frecuencia" value={`${plan.daysPerWeek} días/sem`} />
        <PlanFact label="Sesión" value={`${plan.sessionDurationMinutes} min`} />
      </View>

      {firstWeekSessions.length > 0 ? (
        <View style={styles.sessionList}>
          {firstWeekSessions.map((session, index) => (
            <View key={session.id} style={styles.sessionRow}>
              <View style={styles.sessionNumber}>
                <Text style={styles.sessionNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.sessionTitle}>{session.title}</Text>
                <Text style={styles.sessionFocus} numberOfLines={1}>
                  {session.focus}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.planActions}>
        <Button
          label={saved ? "Guardado en Entrenamiento" : "Guardar en Entrenamiento"}
          onPress={onSave}
          disabled={saved}
        />
        <Button label="Ver plan" onPress={onView} variant="secondary" />
        <View style={styles.adjustLink}>
          <Icon role="tune" size={16} color={colors.accent} />
          <Text style={styles.adjustLinkText} onPress={onAdjust}>
            Pedir un ajuste
          </Text>
        </View>
      </View>
    </Card>
  );
}

function PlanFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

/** Texto plano del coach: preguntas, avisos de seguridad. */
export function CoachTextCard({ text }: { text: string }) {
  return (
    <Card style={styles.textCard}>
      <Text style={styles.plainText}>{text}</Text>
    </Card>
  );
}

export function isEmptyMessage(message: ChatMessage): boolean {
  return !message.content && !message.analysis && !message.planProposal;
}

const styles = StyleSheet.create({
  userRow: { alignItems: "flex-end", marginBottom: spacing.md },
  userBubble: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    maxWidth: "88%",
  },
  userText: { ...typography.body, color: colors.onSurface, fontWeight: "600" },

  coachWrap: { marginBottom: spacing.md, gap: spacing.md },
  coachIdentity: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  coachAvatar: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  coachName: { ...typography.caption, color: colors.text },

  featureCard: {
    backgroundColor: colors.featureCard,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  featureHeadRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  toneDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  headline: { ...typography.headlineMd, color: colors.onFeatureCard, flex: 1 },

  textCard: { marginBottom: spacing.md },
  plainText: { ...typography.body, color: colors.text },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },

  block: { gap: 3 },
  blockLabel: {
    ...typography.caption,
    color: colors.textFaint,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  blockText: { ...typography.body, color: colors.textMuted },
  unavailable: { ...typography.caption, color: colors.textFaint, fontStyle: "italic" },

  recommendationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  recommendationText: { ...typography.body, color: colors.text, flex: 1 },

  provenance: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  provenanceText: { ...typography.caption, color: colors.textFaint, textAlign: "center" },

  planCard: { marginBottom: spacing.md, gap: spacing.md },
  planHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  planIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  planTitle: { ...typography.title, color: colors.text },
  planBadges: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.xs },
  planGoal: { ...typography.body, color: colors.textMuted },
  planFacts: { flexDirection: "row", gap: spacing.sm },
  fact: {
    flex: 1,
    gap: 2,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  factLabel: { ...typography.caption, color: colors.textFaint },
  factValue: { ...typography.bodyStrong, color: colors.text },

  sessionList: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sessionNumber: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.secondaryContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionNumberText: { ...typography.caption, color: colors.onSecondaryContainer, fontWeight: "700" },
  sessionTitle: { ...typography.bodyStrong, color: colors.text },
  sessionFocus: { ...typography.caption, color: colors.textMuted },

  planActions: { gap: spacing.sm },
  adjustLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  adjustLinkText: { ...typography.bodyStrong, color: colors.accent },
  flex: { flex: 1 },
});
