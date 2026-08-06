import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  HankenGrotesk_400Regular,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from "@expo-google-fonts/hanken-grotesk";
import { AppProvider } from "../src/state/AppContext";
import { colors } from "../src/theme";

/** Raíz de navegación. Las pantallas de detalle se apilan sobre las pestañas. */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
  });

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "700", fontFamily: "HankenGrotesk_700Bold" },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="session/[id]" options={{ title: "Sesión" }} />
          <Stack.Screen
            name="session/repeat/[id]"
            options={{ title: "Repetir sesión", presentation: "modal" }}
          />
          <Stack.Screen
            name="exercise/[id]"
            options={{ title: "Técnica", presentation: "modal" }}
          />
          <Stack.Screen name="plan/[id]" options={{ title: "Plan" }} />
          <Stack.Screen name="garmin-login" options={{ title: "Garmin", presentation: "modal" }} />
          <Stack.Screen name="calendar/day/[date]" options={{ title: "Día" }} />
          <Stack.Screen name="calendar/activity/[activityId]" options={{ title: "Actividad" }} />
          <Stack.Screen
            name="calendar/match/[activityId]"
            options={{ title: "Vincular", presentation: "modal" }}
          />
          <Stack.Screen name="estado/all-metrics" options={{ title: "Todas las métricas" }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
