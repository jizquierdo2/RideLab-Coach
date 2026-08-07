import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../src/state/AppContext";
import { api, ApiError } from "../src/api/client";
import { KeyboardAwareScreen } from "../src/components/keyboard";
import { Button, Card, Loading, Notice, StatusDot } from "../src/components/ui";
import { colors, radius, spacing, TOUCH_TARGET, typography } from "../src/theme";

/**
 * Pantalla de conexión con Garmin.
 *
 * La contraseña sólo se envía una vez al backend propio para conectar — la
 * app nunca la guarda, ni en AsyncStorage ni en ningún otro lado. Si la
 * cuenta ya está conectada, muestra el estado y un botón para desconectar.
 */
export default function GarminLoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { ready, garminStatus, refreshGarminStatus } = useApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const isConnected = garminStatus.dataSource === "garmin-mcp" && garminStatus.status === "connected";

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setError(undefined);
    try {
      await api.connectGarmin(email.trim(), password);
      setPassword("");
      await refreshGarminStatus();
      router.back();
    } catch (err) {
      setPassword("");
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con Garmin.");
    } finally {
      setConnecting(false);
    }
  }, [email, password, refreshGarminStatus, router]);

  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true);
    setError(undefined);
    try {
      await api.disconnectGarmin();
      await refreshGarminStatus();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo desconectar.");
    } finally {
      setDisconnecting(false);
    }
  }, [refreshGarminStatus]);

  if (!ready) return <Loading />;

  return (
    <KeyboardAwareScreen>
      <Stack.Screen options={{ title: "Garmin" }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        {isConnected ? (
          <Card style={styles.statusCard}>
            <View style={styles.statusRow}>
              <StatusDot status={garminStatus.status} />
              <Text style={styles.statusTitle}>Garmin conectado</Text>
            </View>
            {garminStatus.lastSyncAt ? (
              <Text style={styles.statusDetail}>
                Última sincronización: {new Date(garminStatus.lastSyncAt).toLocaleString("es-CL")}
              </Text>
            ) : null}
            {error ? <Notice text={error} tone="error" /> : null}
            <Button
              label={disconnecting ? "Desconectando…" : "Desconectar"}
              onPress={() => void handleDisconnect()}
              variant="secondary"
              loading={disconnecting}
            />
          </Card>
        ) : (
          <>
            <View style={styles.headerBlock}>
              <Text style={styles.title}>Conectar Garmin</Text>
              <Text style={styles.subtitle}>
                Ingresa tu usuario y contraseña de Garmin Connect para que el coach use tus datos reales.
              </Text>
            </View>

            <Notice
              tone="info"
              text="Tu contraseña se envía sólo a tu propio backend, para conectar con Garmin. No se guarda en el teléfono."
            />

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Correo</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="tu@correo.com"
                placeholderTextColor={colors.textFaint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Contraseña</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Tu contraseña de Garmin Connect"
                placeholderTextColor={colors.textFaint}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
            </View>

            {error ? <Notice text={error} tone="error" /> : null}

            <Button
              label={connecting ? "Conectando…" : "Conectar"}
              onPress={() => void handleConnect()}
              loading={connecting}
              disabled={!email.trim() || !password}
            />
          </>
        )}
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

  statusCard: { gap: spacing.md },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusTitle: { ...typography.subtitle, color: colors.text },
  statusDetail: { ...typography.caption, color: colors.textMuted },
});
