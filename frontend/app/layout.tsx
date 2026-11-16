import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Starfield } from "@/components/common/starfield";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "ExoScope AI", template: "%s | ExoScope AI" },
  description:
    "Discover Worlds Beyond Our Stars. A 1D CNN that classifies Kepler transit signals, trained on real Kepler light curves.",
};

export const viewport: Viewport = { themeColor: "#050816", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Without JavaScript the scroll reveals never run, so show their content outright. */}
        <noscript><style>{".reveal{opacity:1!important;transform:none!important}"}</style></noscript>
        <Starfield />
        <div className="relative z-10 flex min-h-screen flex-col">{children}</div>
      </body>
    </html>
  );
}
