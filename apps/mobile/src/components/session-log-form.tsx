import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { needsPainEscalation, PAIN_ESCALATION_MESSAGE } from "@ridelab/shared";
import { Button, Card, Notice } from "./ui";
import { colors, radius, spacing, TOUCH_TARGET, typography } from "../theme";

/**
 * Formulario de registro de una sesión.
 *
 * Vive aparte de `session/[id]` porque su estado —duración, RPE, dolor,
 * comentario— sólo le importa a él: la pantalla ya carga con el detalle de la
 * sesión, el ajuste por recuperación y la tarjeta de repetición.
 */

export interface SessionLogValues {
  durationMinutes?: number;
  sessionRpe?: number;
  painLevel: number;
  comment?: string;
}

export function SessionLogForm({
  estimatedMinutes,
  saving,
  saveError,
  onSubmit,
  onCancel,
}: {
  estimatedMinutes: number;
  saving: boolean;
  saveError?: string;
  onSubmit: (values: SessionLogValues) => void;
  onCancel: () => void;
}) {
  const [duration, setDuration] = useState("");
  const [sessionRpe, setSessionRpe] = useState<number | undefined>();
  const [painLevel, setPainLevel] = useState(0);
  const [comment, setComment] = useState("");

  const submit = () =>
    onSubmit({
      durationMinutes: duration ? Number(duration) : undefined,
      sessionRpe,
      painLevel,
      comment: comment.trim() || undefined,
    });

  return (
    <Card style={styles.logCard}>
      <Text style={styles.logTitle}>Registro de la sesión</Text>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Duración real (min)</Text>
        <TextInput
          value={duration}
          onChangeText={setDuration}
          keyboardType="number-pad"
          placeholder={String(estimatedMinutes)}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>RPE de la sesión</Text>
        <Scale value={sessionRpe ?? 0} min={1} max={10} onChange={setSessionRpe} />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Dolor o molestias (0-10)</Text>
        <Scale value={painLevel} min={0} max={10} onChange={setPainLevel} />
        {needsPainEscalation({ pain: { level: painLevel } }) ? (
          <Notice text={PAIN_ESCALATION_MESSAGE} tone="error" />
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Comentario</Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Cómo te sentiste, qué cambiarías…"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, styles.textArea]}
          multiline
        />
      </View>

      {saveError ? <Notice text={saveError} tone="error" /> : null}

      <Button label={saving ? "Guardando…" : "Finalizar sesión"} onPress={submit} loading={saving} />
      <Button label="Cancelar" variant="ghost" onPress={onCancel} />
    </Card>
  );
}

/** Escala táctil de 0-10 / 1-10, cómoda con el pulgar. */
export function Scale({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const options = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  return (
    <View style={styles.scale}>
      {options.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === option }}
          accessibilityLabel={`Valor ${option}`}
          onPress={() => onChange(option)}
          style={[styles.scaleItem, value === option && styles.scaleItemActive]}
        >
          <Text style={[styles.scaleText, value === option && styles.scaleTextActive]}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  logCard: { gap: spacing.lg },
  logTitle: { ...typography.subtitle, color: colors.text },
  field: { gap: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.textMuted },
  input: {
    minHeight: TOUCH_TARGET,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  textArea: { minHeight: 90, paddingTop: spacing.md, textAlignVertical: "top" },

  scale: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  // 48 = TOUCH_TARGET. Antes eran 40 px: once objetivos chicos y pegados, justo
  // cuando el usuario registra la sesión cansado después de entrenar.
  scaleItem: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  scaleItemActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  scaleText: { ...typography.bodyStrong, color: colors.textMuted },
  scaleTextActive: { color: colors.onAccent },
});
