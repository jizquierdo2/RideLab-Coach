import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radius, spacing, TOUCH_TARGET, toneColor, typography } from "../theme";

/** Primitivas visuales compartidas. Sin tarjetas dentro de tarjetas. */

export function Card({
  children,
  style,
  tone = "surface",
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "surface" | "alt" | "accent";
}) {
  return (
    <View
      style={[
        styles.card,
        tone === "alt" && styles.cardAlt,
        tone === "accent" && styles.cardAccent,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "ghost" && styles.buttonGhost,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onAccent : colors.accent} />
      ) : (
        <Text style={[styles.buttonLabel, isPrimary ? styles.buttonLabelPrimary : styles.buttonLabelAlt]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Chip de métrica: "Sueño · 6 h 42 min". */
export function MetricChip({ label, value, tone = "neutral" }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.chip}>
      <View style={[styles.chipDot, { backgroundColor: toneColor[tone] ?? colors.neutral }]} />
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{value}</Text>
    </View>
  );
}

/** Semáforo del estado de Garmin. */
export function StatusDot({ status }: { status: "connected" | "stale" | "demo" | "disconnected" }) {
  const color =
    status === "connected"
      ? colors.statusConnected
      : status === "stale" || status === "demo"
        ? colors.statusStale
        : colors.statusDisconnected;
  return <View style={[styles.statusDot, { backgroundColor: color }]} />;
}

export function Badge({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "good" | "warning" | "accent" }) {
  return (
    <View
      style={[
        styles.badge,
        tone === "good" && { backgroundColor: "rgba(62,103,71,0.14)" },
        tone === "warning" && { backgroundColor: colors.warningBg },
        tone === "accent" && { backgroundColor: colors.accentMuted },
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          tone === "good" && { color: colors.good },
          tone === "warning" && { color: colors.warning },
          tone === "accent" && { color: colors.accent },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

/** Estado vacío o de error, con acción opcional. */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" style={{ marginTop: spacing.lg }} />
      ) : null}
    </View>
  );
}

/** Aviso persistente: datos demo, sin conexión, datos desactualizados. */
export function Notice({ text, tone = "warning" }: { text: string; tone?: "warning" | "error" | "info" }) {
  return (
    <View
      style={[
        styles.notice,
        tone === "error" && { borderColor: "rgba(186,26,26,0.35)", backgroundColor: "rgba(186,26,26,0.10)" },
        tone === "info" && { borderColor: colors.border, backgroundColor: colors.surfaceAlt },
      ]}
    >
      <Text
        style={[
          styles.noticeText,
          tone === "error" && { color: colors.bad },
          tone === "info" && { color: colors.textMuted },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.loadingLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardAlt: {
    backgroundColor: colors.surfaceAlt,
  },
  cardAccent: {
    backgroundColor: colors.accentMuted,
    borderColor: "rgba(72,104,0,0.25)",
  },

  button: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonSecondary: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  buttonGhost: { backgroundColor: "transparent" },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.82 },
  buttonLabel: { ...typography.bodyStrong },
  buttonLabelPrimary: { color: colors.onAccent },
  buttonLabelAlt: { color: colors.accent },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipLabel: { ...typography.caption, color: colors.textMuted },
  chipValue: { ...typography.caption, color: colors.text, fontWeight: "700" },

  statusDot: { width: 8, height: 8, borderRadius: 4 },

  badge: {
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    alignSelf: "flex-start",
  },
  badgeText: { ...typography.caption, color: colors.textMuted },

  sectionHeader: { marginBottom: spacing.md, gap: 2 },
  sectionTitle: { ...typography.label, color: colors.textMuted, textTransform: "uppercase" },
  sectionHint: { ...typography.caption, color: colors.textFaint },

  empty: { alignItems: "center", paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.subtitle, color: colors.text, textAlign: "center" },
  emptyDescription: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
  },

  notice: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(138,90,0,0.32)",
    backgroundColor: colors.warningBg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  noticeText: { ...typography.caption, color: colors.warning },

  loading: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  loadingLabel: { ...typography.caption, color: colors.textMuted },
});
