import "./globals.css";
import Script from "next/script";
import { TgBoot } from "@/components/TgBoot";


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <TgBoot />
        {children}
      </body>
    </html>
  );
}
