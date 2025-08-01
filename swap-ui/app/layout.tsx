import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { PrivyProvider } from "@/providers";
import { ToastProvider } from "@/components/ui/ToastContainer";
import { AppInitializer } from "@/components/layout";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f97316", // Orange theme color
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://pro.moonx.farm"),
  title: "MoonX Swap - Cross-Chain DEX Aggregator",
  description: "Multi-aggregator routing • MEV Protection • Best execution on EVM chains",
  keywords: ["DeFi", "DEX", "Swap", "Ethereum", "Base", "Cross-chain", "MoonX"],
  authors: [{ name: "MoonX Team" }],
  robots: "index, follow",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/logo-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/logo-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "MoonX Swap - Cross-Chain DEX Aggregator",
    description: "Multi-aggregator routing • MEV Protection • Best execution",
    url: "https://pro.moonx.farm",
    siteName: "MoonX Swap",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MoonX Swap - Cross-Chain DEX Aggregator",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MoonX Swap - Cross-Chain DEX Aggregator",
    description: "Multi-aggregator routing • MEV Protection • Best execution",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased bg-gradient-to-br from-gray-900 via-[#0f1014] to-black min-h-screen overflow-x-hidden scrollbar-hide`}
      >
        <PrivyProvider>
          <ToastProvider>
            <AppInitializer>
              {children}
            </AppInitializer>
          </ToastProvider>
        </PrivyProvider>
      </body>
    </html>
  );
}
