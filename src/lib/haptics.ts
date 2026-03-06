import { getTelegramWebApp, type TelegramHapticStyle, type TelegramHapticType } from "@/types/telegram";

export function hapticImpact(style: TelegramHapticStyle = "light") {
  const tg = getTelegramWebApp();
  tg?.HapticFeedback?.impactOccurred?.(style);
}

export function hapticSelection() {
  const tg = getTelegramWebApp();
  tg?.HapticFeedback?.selectionChanged?.();
}

export function hapticSuccess() {
  const tg = getTelegramWebApp();
  tg?.HapticFeedback?.notificationOccurred?.("success");
}

export function hapticNotify(type: TelegramHapticType = "success") {
  const tg = getTelegramWebApp();
  tg?.HapticFeedback?.notificationOccurred?.(type);
}
