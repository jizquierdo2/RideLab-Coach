import React from "react";
import { Tabs } from "expo-router";
import { StyleSheet, type ColorValue } from "react-native";
import { Icon } from "../../src/components/icon";
import { colors, spacing, typography } from "../../src/theme";

/**
 * Cuatro pestañas: Chat (inicial), Estado, Entrenamiento y Calendario.
 * Los detalles se abren apilados, no como pestañas extra.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: styles.tabBar,
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

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  tabLabel: { ...typography.caption, fontWeight: "600" },
});
