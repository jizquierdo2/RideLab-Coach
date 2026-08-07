import React from "react";
import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../../src/components/icon";
import { colors, spacing, typography } from "../../src/theme";

/**
 * Cuatro pestañas: Chat (inicial), Estado, Entrenamiento y Calendario.
 * Los detalles se abren apilados, no como pestañas extra.
 */
export default function TabsLayout() {
  // Sin sumar el inset, la barra de gestos de Android queda encima de las
  // etiquetas: alto y padding fijos no alcanzan en pantallas con navegación
  // por gestos.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: [
          styles.tabBar,
          { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: spacing.sm + insets.bottom },
        ],
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chat",
          tabBarIcon: ({ color }) => <Icon role="coach" size={22} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="estado"
        options={{
          title: "Estado",
          tabBarIcon: ({ color }) => <Icon role="heartRate" size={22} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: "Entrenamiento",
          tabBarIcon: ({ color }) => <Icon role="exerciseCount" size={22} color={color as string} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendario",
          tabBarIcon: ({ color }) => <Icon role="calendar" size={22} color={color as string} />,
        }}
      />
    </Tabs>
  );
}

/** Alto de la barra sin contar el área segura del dispositivo. */
const TAB_BAR_HEIGHT = 64;

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
  tabLabel: { ...typography.caption, fontWeight: "600" },
});
