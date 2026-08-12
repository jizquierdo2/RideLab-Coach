import React, { useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { findExercise, VIDEO_PENDING_LABEL } from "@ridelab/shared";
import { Badge, Card, EmptyState, Notice, SectionHeader } from "../../src/components/ui";
import { Icon } from "../../src/components/icon";
import { colors, radius, spacing, typography } from "../../src/theme";

/**
 * Ficha de técnica de un ejercicio.
 *
 * El video se abre en YouTube con `Linking`, que es más estable que embeberlo:
 * no depende de que el video permita incrustación ni de una WebView extra.
 */
export default function ExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [videoError, setVideoError] = useState<string | undefined>();

  const exercise = id ? findExercise(id) : undefined;

  if (!exercise) {
    return (
      <EmptyState
        title="Ejercicio no encontrado"
        description="Este ejercicio no está en el catálogo local."
        actionLabel="Volver"
        onAction={() => router.back()}
      />
    );
  }

  const openVideo = async () => {
    if (!exercise.videoUrl) return;
    try {
      // `Linking.canOpenURL` da falsos negativos en Android 11+ para `https://`
      // si la app no declara `<queries>` en el manifest — el link SÍ abre con
      // `openURL` (el sistema resuelve el intent igual), así que no vale la
      // pena precalificarlo: mejor confiar en el catch.
      await Linking.openURL(exercise.videoUrl);
    } catch {
      setVideoError("No se pudo abrir el video.");
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: exercise.nameEs }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={exercise.videoUrl ? "Reproducir video de técnica" : VIDEO_PENDING_LABEL}
          onPress={() => void openVideo()}
          disabled={!exercise.videoUrl}
          style={styles.videoWrap}
        >
          {exercise.thumbnailUrl ? (
            <Image source={{ uri: exercise.thumbnailUrl }} style={styles.video} resizeMode="cover" />
          ) : (
            <View style={[styles.video, styles.videoEmpty]} />
          )}
          {exercise.videoUrl ? (
            <View style={styles.playButtonWrap}>
              <View style={styles.playButton}>
                <Icon role="playCircle" size={32} color={colors.onPrimary} />
              </View>
            </View>
          ) : null}
        </Pressable>
        <Text style={styles.videoLabel}>{exercise.videoUrl ? "Ver en YouTube" : VIDEO_PENDING_LABEL}</Text>

        {!exercise.videoUrl ? (
          <Notice text="Este ejercicio todavía no tiene un video verificado asociado." tone="info" />
        ) : null}
        {videoError ? <Notice text={videoError} tone="error" /> : null}

        <View style={styles.headerBlock}>
          <Text style={styles.title}>{exercise.nameEs}</Text>
          <Text style={styles.original}>{exercise.nameOriginal}</Text>
          <View style={styles.badges}>
            <Badge text={PATTERN_LABEL[exercise.pattern] ?? exercise.pattern} tone="accent" />
            <Badge text={LEVEL_LABEL[exercise.level]} />
            {exercise.equipment.map((item) => (
              <Badge key={item} text={item} />
            ))}
          </View>
          <Text style={styles.muscles}>Trabaja: {exercise.primaryMuscles.join(", ")}</Text>
        </View>

        <View>
          <SectionHeader title="Cómo ejecutarlo" />
          <Card style={styles.stepsCard}>
            {exercise.techniqueCues.map((cue, index) => (
              <View key={cue} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{cue}</Text>
              </View>
            ))}
          </Card>
        </View>

        {exercise.commonMistakes.length > 0 ? (
          <View>
            <SectionHeader title="Errores frecuentes" />
            <View style={styles.mistakesBox}>
              {exercise.commonMistakes.map((mistake) => (
                <View key={mistake} style={styles.mistakeRow}>
                  <Icon role="cancel" size={16} color={colors.onErrorContainer} />
                  <Text style={styles.mistakeText}>{mistake}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View>
          <SectionHeader title="Alternativas" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.alternativesScroll}>
            <Card tone="alt" style={styles.alternative}>
              <Text style={styles.altLabel}>Más fácil</Text>
              <Text style={styles.altText}>{exercise.easierAlternative ?? "Sin alternativa registrada"}</Text>
            </Card>
            <View style={styles.alternativeDark}>
              <Text style={styles.altLabelDark}>Más avanzada</Text>
              <Text style={styles.altTextDark}>{exercise.harderAlternative ?? "Sin alternativa registrada"}</Text>
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </>
  );
}

const PATTERN_LABEL: Record<string, string> = {
  squat: "Sentadilla",
  hinge: "Bisagra",
  lunge: "Zancada",
  push: "Empuje",
  pull: "Tracción",
  carry: "Acarreo",
  core: "Core",
  jump: "Salto",
  mobility: "Movilidad",
  grip: "Agarre",
};

const LEVEL_LABEL: Record<string, string> = {
  beginner: "Inicial",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },

  videoWrap: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.surfaceAlt },
  video: { width: "100%", aspectRatio: 16 / 9 },
  videoEmpty: { backgroundColor: colors.surfaceAlt },
  playButtonWrap: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(72,104,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoLabel: { ...typography.bodyStrong, color: colors.text, textAlign: "center" },

  headerBlock: { gap: spacing.sm },
  title: { ...typography.display, color: colors.text },
  original: { ...typography.body, color: colors.textMuted },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs },
  muscles: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },

  stepsCard: { gap: spacing.md },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.secondaryContainer,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepNumberText: { ...typography.caption, color: colors.onSecondaryContainer, fontWeight: "700" },
  stepText: { ...typography.body, color: colors.text, flex: 1, lineHeight: 21 },

  mistakesBox: {
    backgroundColor: "rgba(255,218,214,0.3)",
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  mistakeRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  mistakeText: { ...typography.body, color: colors.onErrorContainer, flex: 1, lineHeight: 21 },

  alternativesScroll: { flexDirection: "row" },
  alternative: { width: 220, marginRight: spacing.md, gap: 2 },
  alternativeDark: {
    width: 220,
    backgroundColor: colors.featureCard,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 2,
  },
  altLabel: { ...typography.caption, color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.6 },
  altText: { ...typography.body, color: colors.text },
  altLabelDark: {
    ...typography.caption,
    color: colors.onFeatureCardFaint,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  altTextDark: { ...typography.body, color: colors.onFeatureCard },
});
