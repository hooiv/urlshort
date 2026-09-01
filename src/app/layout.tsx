import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  title: {
    default: "QuickLink — Smart links that adapt to your audience",
    template: "%s — QuickLink",
  },
  description:
    "Create one permanent short link, then route visitors by country, device, referrer, or weighted experiment. Analytics, conversions, branded domains, and health failover included.",
  applicationName: "QuickLink",
  openGraph: {
    type: "website",
    siteName: "QuickLink",
    title: "QuickLink — Smart links that adapt to your audience",
    description:
      "One link. Many destinations. Route visitors by context, run weighted experiments, and measure conversions.",
  },
  twitter: {
    card: "summary",
    title: "QuickLink — Smart links that adapt to your audience",
    description: "One link. Many destinations. Context-aware routing with conversion analytics.",
  },
  robots: { index: true, follow: true },
};

import { CommandPalette } from '@/components/CommandPalette';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ConsentBanner } from '@/components/ConsentBanner';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="fixed right-4 top-4 z-40"><ThemeToggle /></div>
        <CommandPalette />
        <ServiceWorkerRegister />
        <ConsentBanner />
        {children}
      </body>
    </html>
  );
}