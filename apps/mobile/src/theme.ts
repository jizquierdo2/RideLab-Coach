/**
 * Sistema visual de RideLab Coach.
 *
 * Material Design 3, modo claro: fondo blanco cálido, tarjetas de contraste
 * suave y verde oliva como color de acción. Las tarjetas de énfasis (respuesta
 * del coach, próxima sesión, aviso de recuperación) usan grafito oscuro como
 * acento puntual, no como base del tema. Diseñado primero para pantallas
 * Android de 360-412 px de ancho y uso a una mano.
 */

/** Roles crudos de Material Design 3, sin remapear. Fuente de verdad de los hex. */
const m3 = {
  outline: "#737a64",
  outlineVariant: "#c3c9b0",

  surface: "#f8faf6",
  surfaceDim: "#d9dad7",
  surfaceBright: "#f8faf6",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow: "#f3f4f0",
  surfaceContainer: "#edeeeb",
  surfaceContainerHigh: "#e7e9e5",
  surfaceContainerHighest: "#e1e3df",
  surfaceVariant: "#e1e3df",
  surfaceTint: "#486800",

  background: "#f8faf6",
  onBackground: "#191c1a",
  onSurface: "#191c1a",
  onSurfaceVariant: "#434936",

  primary: "#486800",
  onPrimary: "#ffffff",
  primaryContainer: "#b9f34a",
  onPrimaryContainer: "#4c6d00",
  primaryFixed: "#bbf54c",
  primaryFixedDim: "#a0d82f",
  onPrimaryFixed: "#131f00",
  onPrimaryFixedVariant: "#364e00",

  secondary: "#3e6747",
  onSecondary: "#ffffff",
  secondaryContainer: "#bdebc2",
  onSecondaryContainer: "#426c4b",
  secondaryFixed: "#c0eec5",
  secondaryFixedDim: "#a4d2aa",
  onSecondaryFixed: "#00210c",
  onSecondaryFixedVariant: "#264f31",

  tertiary: "#5a605b",
  onTertiary: "#ffffff",
  tertiaryContainer: "#dce2dc",
  onTertiaryContainer: "#5f6560",
  tertiaryFixed: "#dee4de",
  tertiaryFixedDim: "#c2c8c2",
  onTertiaryFixed: "#171d19",
  onTertiaryFixedVariant: "#424844",

  error: "#ba1a1a",
  onError: "#ffffff",
  errorContainer: "#ffdad6",
  onErrorContainer: "#93000a",

  inverseSurface: "#2e312f",
  inverseOnSurface: "#f0f1ed",
  inversePrimary: "#a0d82f",
} as const;

export const colors = {
  ...m3,

  /** Fondo base, blanco cálido. */
  background: m3.background,
  /** Tarjetas sobre el fondo. */
  surface: m3.surfaceContainerLowest,
  /** Segundo nivel, para filas dentro de una tarjeta. */
  surfaceAlt: m3.surfaceContainerLow,
  border: m3.outlineVariant,

  text: m3.onSurface,
  textMuted: m3.onSurfaceVariant,
  textFaint: m3.outline,

  /**
   * Verde oliva: color de acción. `primary` + `onPrimary` blanco replica el rol
   * de "único CTA fuerte" que antes cumplía el lima sobre fondo oscuro.
   */
  accent: m3.primary,
  /** Texto sobre superficies de acento. */
  onAccent: m3.onPrimary,
  /** Fondo sutil de acento (lima claro, invertido respecto del tema oscuro). */
  accentMuted: m3.primaryContainer,

  good: m3.secondary,
  /**
   * El dump de M3 de Stitch no trae un rol ámbar/warning. `warningText` es un
   * ámbar oscurecido con contraste ~5:1 sobre blanco, pensado para texto — no
   * confundir con `warningOnDark`, que es el ámbar literal del mockup y solo
   * es legible sobre `featureCard`.
   */
  warning: "#8a5a00",
  bad: m3.error,
  neutral: m3.onSurfaceVariant,

  /** Semáforo del estado de Garmin. */
  statusConnected: m3.secondary,
  statusStale: "#8a5a00",
  statusDemo: "#8a5a00",
  statusDisconnected: m3.outline,

  /**
   * Tarjeta grafito de énfasis (respuesta del coach, próxima sesión, aviso de
   * recuperación). Literal exacto que pinta Stitch — no es lo mismo que
   * `inverseSurface`, que queda disponible pero sin uso hoy.
   */
  featureCard: "#202521",
  onFeatureCard: "#ffffff",
  onFeatureCardMuted: "rgba(255,255,255,0.8)",
  onFeatureCardFaint: "rgba(255,255,255,0.7)",
  /** Ámbar/rojo del mockup: solo legibles sobre `featureCard`. */
  warningOnDark: "#fbbc04",
  badOnDark: "#ffb4ab",

  warningText: "#8a5a00",
  warningBg: "rgba(138,90,0,0.12)",
} as const;

/** Tono de acento dentro de una tarjeta `featureCard` (fondo oscuro). */
export const featureCardToneColor: Record<"good" | "warning" | "bad", string> = {
  good: colors.inversePrimary,
  warning: colors.warningOnDark,
  bad: colors.badOnDark,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  /** Separación entre bloques mayores de una pantalla (M3 "section-gap"). */
  sectionGap: 48,
} as const;

export const radius = {
  /** Controles diminutos (M3 "DEFAULT"). */
  xs: 4,
  sm: 8,
  /** Radius por defecto de Card — coincide con el `rounded-xl` dominante del diseño. */
  md: 12,
  /** Tarjetas de énfasis (`featureCard`, plan propuesto). */
  lg: 16,
  pill: 999,
} as const;

const font = {
  regular: "HankenGrotesk_400Regular",
  semiBold: "HankenGrotesk_600SemiBold",
  bold: "HankenGrotesk_700Bold",
  extraBold: "HankenGrotesk_800ExtraBold",
} as const;

export const typography = {
  /** Títulos de pantalla (M3 "headline-lg-mobile"). */
  display: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const, fontFamily: font.bold },
  /** Títulos de tarjeta (M3 "title-lg"). */
  title: { fontSize: 20, lineHeight: 28, fontWeight: "600" as const, fontFamily: font.semiBold },
  /** Híbrido: tamaño de "body-lg" + peso 600 — M3 no trae un rol semibold ~18px. */
  subtitle: { fontSize: 18, lineHeight: 28, fontWeight: "600" as const, fontFamily: font.semiBold },
  /** M3 "body-md". */
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" as const, fontFamily: font.regular },
  /** Híbrido de "body-md", mismo motivo que `subtitle`. */
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: "600" as const, fontFamily: font.semiBold },
  /** M3 "label-md". */
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600" as const, letterSpacing: 0.7, fontFamily: font.semiBold },
  /** Sin equivalente M3 — extensión propia para metadatos/timestamps. */
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" as const, fontFamily: font.regular },
  /** M3 "headline-md" — solo para el headline dentro de una tarjeta `featureCard`. */
  headlineMd: { fontSize: 24, lineHeight: 32, fontWeight: "600" as const, fontFamily: font.semiBold },
} as const;

/** Alto mínimo cómodo para tocar con el pulgar en Android. */
export const TOUCH_TARGET = 48;

export const toneColor: Record<string, string> = {
  neutral: colors.neutral,
  good: colors.good,
  warning: colors.warning,
  bad: colors.bad,
};
