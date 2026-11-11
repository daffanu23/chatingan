import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhatsApp Web",
  description: "Aplikasi chat real-time dengan kompresi gambar otomatis dan fitur grup.",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#00a884",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#efeae2] dark:bg-[#0b141a] font-sans text-[#111b21] dark:text-[#e9edef]">
        {children}
      </body>
    </html>
  );
}
