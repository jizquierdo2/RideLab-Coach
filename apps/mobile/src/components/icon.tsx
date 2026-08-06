import React from "react";
import { MaterialIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

/**
 * Wrapper semántico sobre MaterialIcons.
 *
 * Las pantallas piden un `role` propio, nunca un nombre de vendor. Esto deja
 * un único lugar donde cambiar de librería o sustituir un glifo sin tocar
 * pantallas. TypeScript verifica en compilación que cada `name` exista en
 * MaterialIcons: si un glifo del mapeo original no tiene 1:1 exacto, `tsc`
 * falla aquí y no en tiempo de ejecución.
 */

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];

const ICON_MAP = {
  coach: "psychology",
  sleep: "bedtime",
  heartRate: "monitor-heart",
  recoveryGood: "battery-charging-full",
  recoveryWarning: "battery-5-bar",
  updateTime: "update",
  send: "send",
  checkCircleFilled: "check-circle",
  checkCircleOutline: "radio-button-unchecked",
  trendingDown: "trending-down",
  trendingUp: "trending-up",
  trendingFlat: "trending-flat",
  warning: "warning",
  info: "info-outline",
  save: "save",
  viewDetail: "visibility",
  timer: "timer",
  calendar: "calendar-today",
  exerciseCount: "fitness-center",
  bolt: "bolt",
  schedule: "schedule",
  pending: "pending",
  playCircle: "play-circle-outline",
  cancel: "cancel",
  chevronRight: "chevron-right",
  chevronLeft: "chevron-left",
  tune: "tune",
  link: "link",
  linkOff: "link-off",
  sync: "sync",
  watch: "watch",
  today: "today",
  close: "close",
  repeat: "replay",
  event: "event",
} as const satisfies Record<string, MaterialIconName>;

export type IconRole = keyof typeof ICON_MAP;

export function Icon({
  role,
  size = 20,
  color,
}: {
  role: IconRole;
  size?: number;
  color: string;
}) {
  return <MaterialIcons name={ICON_MAP[role]} size={size} color={color} />;
}
