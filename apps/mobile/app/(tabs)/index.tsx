import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { QUICK_PROMPTS, type TrainingPlan } from "@ridelab/shared";
import { useApp } from "../../src/state/AppContext";
import { CoachAnalysisCard, CoachTextCard, PlanProposalCard, UserBubble } from "../../src/components/chat";
import { Button, Loading, Notice, StatusDot } from "../../src/components/ui";
import { Icon, type IconRole } from "../../src/components/icon";
import { colors, radius, spacing, TOUCH_TARGET, typography } from "../../src/theme";

/** Un ícono por sugerencia rápida, en el mismo orden que `QUICK_PROMPTS`. */
const PROMPT_ICONS: IconRole[] = ["recoveryGood", "bolt", "viewDetail", "calendar", "exerciseCount", "tune"];

/** Pantalla inicial: conversación con el coach. */
export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    ready,
    messages,
    sending,
    sendingSince,
    chatError,
    garminStatus,
    sendMessage,
    cancelSending,
    savePlan,
    plans,
  } = useApp();

  const [draft, setDraft] = useState("");
  const [savingPlanId, setSavingPlanId] = useState<string | undefined>();
  const [saveError, setSaveError] = useState<string | undefined>();
  const scrollRef = useRef<ScrollView>(null);

  const savedPlanIds = useMemo(() => new Set(plans.map((plan) => plan.id)), [plans]);

  const submit = useCallback(
    async (text: string) => {
      setDraft("");
      await sendMessage(text);
    },
    [sendMessage],
  );

  // Las tarjetas del coach cambian de alto después del primer layout (chips que
  // saltan de línea, miniaturas), así que un solo scroll inmediato se queda corto.
  // Se reintenta un par de veces tras cada turno para terminar siempre abajo.
  useEffect(() => {
    const timers = [0, 80, 250].map((delay) =>
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: delay > 0 }), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [messages.length, sending]);

  const handleSavePlan = useCallback(
    async (plan: TrainingPlan) => {
      setSavingPlanId(plan.id);
      setSaveError(undefined);
      try {
        await savePlan(plan);
        router.push("/training");
      } catch (error) {
        // Un plan que no valida jamás se guarda: se avisa en vez de fingir éxito.
        setSaveError(error instanceof Error ? error.message : "No se pudo guardar el plan");
      } finally {
        setSavingPlanId(undefined);
      }
    },
    [savePlan, router],
  );

  if (!ready) return <Loading label="Cargando tus datos…" />;

  const lastSync = garminStatus.lastSyncAt
    ? new Date(garminStatus.lastSyncAt).toLocaleString("es-CL", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "sin sincronizar";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerTop}>
          <Text style={styles.coachName}>Coach</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Estado de Garmin"
            onPress={() => router.push("/garmin-login")}
            style={styles.statusPill}
          >
            <StatusDot status={garminStatus.status} />
            <Text style={styles.statusText}>{garminStatus.message}</Text>
          </Pressable>
        </View>
        <Text style={styles.syncText}>Última sincronización: {lastSync}</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {garminStatus.status === "demo" ? <Notice text={garminStatus.message} /> : null}
        {garminStatus.status === "stale" ? (
          <Notice text="Datos Garmin desactualizados: la última sincronización tiene más de 24 horas." />
        ) : null}

        {messages.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Pregúntame por tu semana</Text>
            <Text style={styles.emptyDescription}>
              Puedo revisar tu recuperación, analizar tus salidas y armarte un plan de entrenamiento.
            </Text>
            <View style={styles.promptGrid}>
              {QUICK_PROMPTS.map((prompt, index) => (
                <Pressable
                  key={prompt}
                  accessibilityRole="button"
                  onPress={() => void submit(prompt)}
                  style={({ pressed }) => [styles.prompt, pressed && styles.promptPressed]}
                >
                  <Icon role={PROMPT_ICONS[index]} size={20} color={colors.accent} />
                  <Text style={styles.promptText}>{prompt}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {messages.map((message) => {
          if (message.role === "user") return <UserBubble key={message.id} text={message.content} />;
          return (
            <View key={message.id}>
              {message.analysis ? <CoachAnalysisCard analysis={message.analysis} /> : null}
              {message.content ? <CoachTextCard text={message.content} /> : null}
              {message.planProposal ? (
                <PlanProposalCard
                  proposal={message.planProposal}
                  saved={savedPlanIds.has(message.planProposal.plan.id)}
                  onSave={() => void handleSavePlan(message.planProposal!.plan)}
                  onView={() => router.push(`/plan/${message.planProposal!.plan.id}`)}
                  onAdjust={() => setDraft("Ajusta el plan: ")}
                />
              ) : null}
              {message.error ? <Notice text={message.error} tone="error" /> : null}
            </View>
          );
        })}

        {savingPlanId ? <Loading label="Guardando plan…" /> : null}
        {saveError ? <Notice text={saveError} tone="error" /> : null}
        {sending ? <ThinkingIndicator since={sendingSince} onCancel={cancelSending} /> : null}
        {chatError ? <Notice text={chatError} tone="error" /> : null}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Escríbele al coach…"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          multiline
          editable={!sending}
        />
        <Button
          label="Enviar"
          onPress={() => void submit(draft)}
          disabled={!draft.trim() || sending}
          style={styles.send}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

/** Segundos a partir de los cuales se avisa que la espera puede ser larga. */
const LONG_WAIT_SECONDS = 20;

/**
 * Espera del coach, con el tiempo real transcurrido y salida.
 *
 * No inventa etapas de progreso: el cliente no puede ver en qué va el backend,
 * así que muestra lo único que sabe de verdad —cuánto lleva esperando— y avisa
 * recién cuando la espera se vuelve inusual.
 */
function ThinkingIndicator({ since, onCancel }: { since: number | undefined; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (since === undefined) return;
    const tick = () => setElapsed(Math.floor((Date.now() - since) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [since]);

  return (
    <View style={styles.thinking}>
      <ActivityIndicator color={colors.accent} />
      <View style={styles.flex}>
        <Text style={styles.thinkingLabel}>
          El coach está revisando tus datos… {elapsed}s
        </Text>
        {elapsed >= LONG_WAIT_SECONDS ? (
          <Text style={styles.thinkingHint}>
            Armar un plan completo puede tardar más de un minuto.
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancelar la consulta"
        onPress={onCancel}
        style={styles.cancelButton}
      >
        <Text style={styles.cancelButtonText}>Cancelar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  thinking: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  thinkingLabel: { ...typography.caption, color: colors.textMuted },
  thinkingHint: { ...typography.caption, color: colors.textFaint, marginTop: 2 },
  cancelButton: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  cancelButtonText: { ...typography.caption, color: colors.accent, fontWeight: "700" },

  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.xs,
  },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  coachName: { ...typography.display, color: colors.text },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    maxWidth: "62%",
  },
  statusText: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  syncText: { ...typography.caption, color: colors.textFaint },

  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },

  emptyCard: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.title, color: colors.text },
  emptyDescription: { ...typography.body, color: colors.textMuted },
  promptGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  prompt: {
    width: "48%",
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  promptPressed: { backgroundColor: colors.surfaceAlt },
  promptText: { ...typography.body, color: colors.text, lineHeight: 18 },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    maxHeight: 120,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  send: { paddingHorizontal: spacing.lg },
});
