export function hapticImpact(
    style: "light" | "medium" | "heavy" = "light"
  ) {
    if (typeof window === "undefined") return;
    const tg = (window as any)?.Telegram?.WebApp;
    tg?.HapticFeedback?.impactOccurred(style);
  }
  
  export function hapticSelection() {
    if (typeof window === "undefined") return;
    const tg = (window as any)?.Telegram?.WebApp;
    tg?.HapticFeedback?.selectionChanged();
  }
  
  export function hapticSuccess() {
    if (typeof window === "undefined") return;
    const tg = (window as any)?.Telegram?.WebApp;
    tg?.HapticFeedback?.notificationOccurred("success");
  }
  
  export function hapticNotify(type: "success" | "warning" | "error" = "success") {
    if (typeof window === "undefined") return;
    const tg = (window as any)?.Telegram?.WebApp;
    tg?.HapticFeedback?.notificationOccurred?.(type);
  }