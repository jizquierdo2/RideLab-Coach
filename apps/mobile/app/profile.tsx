import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RIDING_DISCIPLINES, type AthleteProfile, type RidingDiscipline } from "@ridelab/shared";
import { useApp } from "../src/state/AppContext";
import { KeyboardAwareScreen } from "../src/components/keyboard";
import { Button, Loading, Notice, SectionHeader } from "../src/components/ui";
import { colors, radius, spacing, TOUCH_TARGET, typography } from "../src/theme";

/** Etiquetas en español para cada disciplina — cambia qué patrones de fuerza prioriza el coach. */
const DISCIPLINE_LABELS: Record<RidingDiscipline, string> = {
  xc: "Cross-country",
  trail: "Trail",
  enduro: "Enduro",
  downhill: "Downhill",
  gravel: "Gravel",
  "e-bike": "E-bike",
};

const EXPERIENCE_LEVELS: Array<{ value: NonNullable<AthleteProfile["experienceLevel"]>; label: string }> = [
  { value: "beginner", label: "Principiante" },
  { value: "intermediate", label: "Intermedio" },
  { value: "advanced", label: "Avanzado" },
];

/** Convierte "Barra, Kettlebell" en ["Barra", "Kettlebell"], descartando vacíos. */
function parseList(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrUndefined(text: string): number | undefined {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Pantalla de perfil del atleta.
 *
 * Es la única forma en que `athleteProfile` llega al coach real sin que el
 * usuario tenga que repetir peso, estatura o disciplina en cada mensaje: lo
 * que se guarda aquí viaja en cada `/api/chat` y calibra `loadGuidance` y las
 * recomendaciones de fuerza específicas para MTB.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, profile, updateProfile } = useApp();

  const [weightKg, setWeightKg] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [experienceLevel, setExperienceLevel] = useState<AthleteProfile["experienceLevel"]>();
  const [ridingDisciplines, setRidingDisciplines] = useState<RidingDiscipline[]>([]);
  const [daysPerWeek, setDaysPerWeek] = useState("");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState("");
  const [goalsText, setGoalsText] = useState("");
  const [equipmentText, setEquipmentText] = useState("");
  const [limitationsText, setLimitationsText] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  // `ready` puede pasar a `true` en un render posterior al primer montaje de
  // esta pantalla (p. ej. si se entra por deep link directo a /profile antes
  // de que el resto de la app termine de cargar) — el valor inicial de
  // `useState` sólo se evalúa una vez, así que sin este efecto los campos se
  // quedarían vacíos aunque `profile` ya tenga datos guardados.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!ready || hydratedRef.current) return;
    hydratedRef.current = true;
    setWeightKg(profile?.weightKg?.toString() ?? "");
    setHeightCm(profile?.heightCm?.toString() ?? "");
    setExperienceLevel(profile?.experienceLevel);
    setRidingDisciplines(profile?.ridingDisciplines ?? []);
    setDaysPerWeek(profile?.daysPerWeek?.toString() ?? "");
    setSessionDurationMinutes(profile?.sessionDurationMinutes?.toString() ?? "");
    setGoalsText((profile?.goals ?? []).join(", "));
    setEquipmentText((profile?.equipment ?? []).join(", "));
    setLimitationsText((profile?.limitations ?? []).join(", "));
    setNotes(profile?.notes ?? "");
  }, [ready, profile]);

  const toggleDiscipline = useCallback((discipline: RidingDiscipline) => {
    setSaved(false);
    setRidingDisciplines((current) =>
      current.includes(discipline) ? current.filter((item) => item !== discipline) : [...current, discipline],
    );
  }, []);

  const markDirty = useCallback((setter: (value: string) => void) => {
    return (value: string) => {
      setSaved(false);
      setter(value);
    };
  }, []);

  const patch: Partial<AthleteProfile> = useMemo(
    () => ({
      weightKg: numberOrUndefined(weightKg),
      heightCm: numberOrUndefined(heightCm),
      experienceLevel,
      ridingDisciplines,
      daysPerWeek: numberOrUndefined(daysPerWeek),
      sessionDurationMinutes: numberOrUndefined(sessionDurationMinutes),
      goals: parseList(goalsText),
      equipment: parseList(equipmentText),
      limitations: parseList(limitationsText),
      notes: notes.trim() || undefined,
    }),
    [
      weightKg,
      heightCm,
      experienceLevel,
      ridingDisciplines,
      daysPerWeek,
      sessionDurationMinutes,
      goalsText,
      equipmentText,
      limitationsText,
      notes,
    ],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(undefined);
    try {
      await updateProfile(patch);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el perfil.");
    } finally {
      setSaving(false);
    }
  }, [patch, updateProfile]);

  if (!ready) return <Loading />;

  return (
    <KeyboardAwareScreen>
      <Stack.Screen options={{ title: "Tu perfil" }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerBlock}>
          <Text style={styles.title}>Tu perfil</Text>
          <Text style={styles.subtitle}>
            El coach usa esto en cada respuesta para calibrar cargas y priorizar ejercicios — no hace falta que lo
            repitas en el chat.
          </Text>
        </View>

        <View>
          <SectionHeader title="Cuerpo" />
          <View style={styles.row}>
            <View style={[styles.field, styles.flex1]}>
              <Text style={styles.fieldLabel}>Peso (kg)</Text>
              <TextInput
                value={weightKg}
                onChangeText={markDirty(setWeightKg)}
                placeholder="90"
                placeholderTextColor={colors.textFaint}
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </View>
            <View style={[styles.field, styles.flex1]}>
              <Text style={styles.fieldLabel}>Estatura (cm)</Text>
              <TextInput
                value={heightCm}
                onChangeText={markDirty(setHeightCm)}
                placeholder="187"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
          </View>
        </View>

        <View>
          <SectionHeader title="Experiencia en fuerza" />
          <View style={styles.chipRow}>
            {EXPERIENCE_LEVELS.map((level) => {
              const active = experienceLevel === level.value;
              return (
                <Text
                  key={level.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setSaved(false);
                    setExperienceLevel(active ? undefined : level.value);
                  }}
                  style={[styles.selectChip, active && styles.selectChipActive]}
                >
                  {level.label}
                </Text>
              );
            })}
          </View>
        </View>

        <View>
          <SectionHeader title="Disciplinas de MTB" hint="Elige todas las que practiques" />
          <View style={styles.chipRow}>
            {RIDING_DISCIPLINES.map((discipline) => {
              const active = ridingDisciplines.includes(discipline);
              return (
                <Text
                  key={discipline}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => toggleDiscipline(discipline)}
                  style={[styles.selectChip, active && styles.selectChipActive]}
                >
                  {DISCIPLINE_LABELS[discipline]}
                </Text>
              );
            })}
          </View>
        </View>

        <View>
          <SectionHeader title="Disponibilidad" />
          <View style={styles.row}>
            <View style={[styles.field, styles.flex1]}>
              <Text style={styles.fieldLabel}>Días por semana</Text>
              <TextInput
                value={daysPerWeek}
                onChangeText={markDirty(setDaysPerWeek)}
                placeholder="3"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
            <View style={[styles.field, styles.flex1]}>
              <Text style={styles.fieldLabel}>Minutos por sesión</Text>
              <TextInput
                value={sessionDurationMinutes}
                onChangeText={markDirty(setSessionDurationMinutes)}
                placeholder="60"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                style={styles.input}
              />
            </View>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Objetivos (separados por coma)</Text>
          <TextInput
            value={goalsText}
            onChangeText={markDirty(setGoalsText)}
            placeholder="Resistir descensos largos, ganar fuerza"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Equipamiento (separado por coma)</Text>
          <TextInput
            value={equipmentText}
            onChangeText={markDirty(setEquipmentText)}
            placeholder="Mancuernas, kettlebell, barra"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Molestias o limitaciones (separadas por coma)</Text>
          <TextInput
            value={limitationsText}
            onChangeText={markDirty(setLimitationsText)}
            placeholder="Ninguna"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Notas para el coach</Text>
          <TextInput
            value={notes}
            onChangeText={markDirty(setNotes)}
            placeholder="Terreno favorito, ejercicios que te gustan o quieres evitar, competencias…"
            placeholderTextColor={colors.textFaint}
            multiline
            style={[styles.input, styles.textArea]}
          />
        </View>

        {error ? <Notice text={error} tone="error" /> : null}
        {saved && !error ? <Notice text="Perfil guardado." tone="info" /> : null}

        <Button
          label={saving ? "Guardando…" : "Guardar perfil"}
          onPress={() => void handleSave()}
          loading={saving}
        />

        <Text
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.doneLink}
        >
          Listo
        </Text>
      </ScrollView>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },

  headerBlock: { gap: spacing.xs },
  title: { ...typography.display, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },

  row: { flexDirection: "row", gap: spacing.md },
  flex1: { flex: 1 },

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

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  selectChip: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textMuted,
    textAlignVertical: "center",
    ...typography.bodyStrong,
  },
  selectChipActive: {
    backgroundColor: colors.accentMuted,
    borderColor: "rgba(72,104,0,0.35)",
    color: colors.accent,
  },

  doneLink: {
    ...typography.bodyStrong,
    color: colors.accent,
    textAlign: "center",
    paddingVertical: spacing.md,
  },
});
