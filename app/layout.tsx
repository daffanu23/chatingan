import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatApp",
  description: "Simple chat application with Supabase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50 dark:bg-gray-950 font-sans">
        {children}
      </body>
    </html>
  );
}
