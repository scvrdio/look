import "./globals.css";
import Script from "next/script";
import { TgBoot } from "@/components/TgBoot";
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <TgBoot />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}