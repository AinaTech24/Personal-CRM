import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { DensityInit } from "@/components/providers/density-init";
import { PwaRegister } from "@/components/providers/pwa-register";
import { StaleBundleRecovery } from "@/components/providers/stale-bundle-recovery";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aina CRM",
  description: "Internal operations platform for AinaTech",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
  // Installable app metadata (the manifest itself lives in app/manifest.ts).
  applicationName: "Aina CRM",
  appleWebApp: { capable: true, title: "Aina CRM", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <ToastProvider>
            <DensityInit />
            <PwaRegister />
            <StaleBundleRecovery />
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
