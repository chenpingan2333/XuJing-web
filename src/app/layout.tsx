import type { Metadata, Viewport } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";


export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "叙境 Xujing",
  description: "AI 恋爱陪伴平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
