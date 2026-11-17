import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { restoreThemeScript } from "@/lib/theme";
import "./theme.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "校园社团活动复盘助手",
  description: "分析社团活动的报名与到场数据，复核签到记录与渠道表现。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: restoreThemeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
