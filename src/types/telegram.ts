export type TelegramHapticType = "success" | "warning" | "error";
export type TelegramHapticStyle = "light" | "medium" | "heavy";

export type TelegramPopupButtonType = "default" | "ok" | "close" | "cancel" | "destructive";

export type TelegramPopupButton = {
  id?: string;
  type?: TelegramPopupButtonType;
  text?: string;
};

export type TelegramPopupParams = {
  title?: string;
  message: string;
  buttons?: TelegramPopupButton[];
};

export type TelegramWebApp = {
  version?: string;
  initData?: string;
  initDataUnsafe?: {
    user?: {
      first_name?: string;
    };
  };
  safeAreaInset?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  contentSafeAreaInset?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  ready?: () => void;
  expand?: () => void;
  requestFullscreen?: () => void;
  disableVerticalSwipes?: () => void;
  isExpanded?: boolean;
  isFullscreen?: boolean;
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  HapticFeedback?: {
    impactOccurred?: (style: TelegramHapticStyle) => void;
    selectionChanged?: () => void;
    notificationOccurred?: (type: TelegramHapticType) => void;
  };
  showPopup?: (
    params: TelegramPopupParams,
    callback?: (buttonId: string) => void
  ) => void;
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

export function getTelegramWebApp(): TelegramWebApp | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as TelegramWindow).Telegram?.WebApp;
}
