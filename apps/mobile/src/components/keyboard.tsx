import React from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../theme";

/**
 * Envoltorio para pantallas con campos de texto.
 *
 * Sin esto el teclado de Android se monta encima del campo que el usuario está
 * escribiendo: pasaba en Estado, en el registro de sesión, al programar una
 * repetición y en el login de Garmin. El `behavior` difiere por plataforma, así
 * que vive en un solo lugar en vez de repetirse en cada pantalla.
 */
export function KeyboardAwareScreen({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAvoidingView
      style={[styles.fill, style]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
});
