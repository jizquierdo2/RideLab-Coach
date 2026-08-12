import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useApp } from "../../../src/state/AppContext";
import { EmptyState, Loading } from "../../../src/components/ui";
import { Icon, type IconRole } from "../../../src/components/icon";
import { colors, radius, spacing, typography } from "../../../src/theme";

const SOURCE_ICON: Record<string, IconRole> = {
  garmin: "watch",
  training_session: "exerciseCount",
  training_history: "calendar",
  user_feedback: "coach",
};

/**
 * "Ver datos utilizados": sólo lista lo que el Coach realmente consultó para
 * esa respuesta puntual — no un volcado de todas las métricas disponibles.
 * Las métricas completas siguen viviendo en Estado.
 */
export default function DataUsedScreen() {
  const { messageId } = useLocalSearchParams<{ messageId: string }>();
  const router = useRouter();
  const { ready, messages } = useApp();

  const message = messages.find((item) => item.id === messageId);

  if (!ready) return <Loading />;
  if (!message || !message.dataSources?.length) {
    return (
      <EmptyState
        title="Sin datos para mostrar"
        description="Esta respuesta ya no está disponible o no usó ningún dato puntual."
        actionLabel="Volver"
        onAction={() => router.back()}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Datos utilizados", presentation: "modal" }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Lo que el Coach consultó para responderte esto.</Text>
        <View style={styles.list}>
          {message.dataSources.map((source, index) => (
            <View key={`${source.type}-${source.label}-${index}`} style={styles.row}>
              <View style={styles.iconBox}>
                <Icon role={SOURCE_ICON[source.type] ?? "info"} size={18} color={colors.text} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.label}>{source.label}</Text>
                {source.detail ? <Text style={styles.detail}>{source.detail}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  subtitle: { ...typography.body, color: colors.textMuted },
  list: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1 },
  label: { ...typography.bodyStrong, color: colors.text },
  detail: { ...typography.caption, color: colors.textMuted },
});
