import type { Metadata } from "next";
import { AuthProvider } from "@/hooks/use-auth";
import { TauriProvider } from "@/components/tauri-provider";
import { UpdateNotificationBanner } from "@/components/update-notification-banner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Puffin - Personal Finance",
  description: "Your local-first personal finance companion",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
        <TauriProvider>
          <AuthProvider>
            <UpdateNotificationBanner />
            {children}
          </AuthProvider>
        </TauriProvider>
      </body>
    </html>
  );
}
