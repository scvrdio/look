import { cookies } from "next/headers";
import { verifyChatSession } from "./chatSession";
import { isDemoMode } from "@/lib/subscriptions";

export async function getCurrentChatId(): Promise<string | null> {
  const value = (await cookies()).get("tg_chat_id")?.value;
  const chatId = verifyChatSession(value);
  if (chatId) return chatId;

  if (isDemoMode()) {
    return process.env.DEV_TELEGRAM_ID ?? "1";
  }

  return null;
}
