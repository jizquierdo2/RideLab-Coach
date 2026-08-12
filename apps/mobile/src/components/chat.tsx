import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ChatMessage, PlanProposal, SuggestedAction } from "@ridelab/shared";
import { Badge, Button, Card } from "./ui";
import { Icon } from "./icon";
import { colors, radius, spacing, TOUCH_TARGET, typography } from "../theme";

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

/**
 * Respuesta del coach: una sola burbuja conversacional, sin secciones
 * tituladas ni chips de métricas — el mensaje se siente como chat, no como
 * una pantalla de resultados. Los datos que realmente se usaron quedan
 * detrás de "Ver datos utilizados" (discreto, aparte de las acciones
 * sugeridas); las métricas completas siguen viviendo en Estado.
 */
export function CoachReplyBubble({
  message,
  onAction,
  onShowDataUsed,
}: {
  message: ChatMessage;
  onAction: (action: SuggestedAction) => void;
  onShowDataUsed: () => void;
}) {
  if (!message.content) return null;

  const actions = message.suggestedActions ?? [];
  const hasDataSources = (message.dataSources?.length ?? 0) > 0;

  return (
    <View style={styles.coachWrap}>
      <View style={styles.coachIdentity}>
        <View style={styles.coachAvatar}>
          <Icon role="coach" size={16} color={colors.primary} />
        </View>
        <Text style={styles.coachName}>Coach</Text>
      </View>

      <View style={styles.replyBubble}>
        <Text style={styles.replyText}>{message.content}</Text>
      </View>

      {actions.length > 0 ? (
        <View style={styles.actionsRow}>
          {actions.slice(0, 3).map((action) => (
            <Pressable
              key={action.id}
              accessibilityRole="button"
              onPress={() => onAction(action)}
              style={styles.actionChip}
            >
              <Text style={styles.actionChipText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {hasDataSources ? (
        <Pressable accessibilityRole="button" onPress={onShowDataUsed} style={styles.dataUsedLink}>
          <Icon role="info" size={14} color={colors.textFaint} />
          <Text style={styles.dataUsedLinkText}>Ver datos utilizados</Text>
        </Pressable>
      ) : null}
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

export function isEmptyMessage(message: ChatMessage): boolean {
  return !message.content && !message.planProposal;
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

  replyBubble: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderBottomLeftRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  replyText: { ...typography.body, color: colors.text, lineHeight: 22 },

  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actionChip: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  actionChipText: { ...typography.caption, color: colors.accent, fontWeight: "700" },

  dataUsedLink: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: TOUCH_TARGET },
  dataUsedLinkText: { ...typography.caption, color: colors.textFaint, textDecorationLine: "underline" },

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
