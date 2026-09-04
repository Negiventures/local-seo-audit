import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SITE_URL } from "@/lib/site";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  // Without this, every relative Open Graph URL resolves against
  // whatever host served the page, including preview deployments.
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: SITE_URL },
  title: "Local SEO Audit: can customers find and contact this business?",
  description:
    "Check any small-business website for the things that decide whether it shows up in local search and whether a visitor can actually get in touch.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}<Analytics /></body>
    </html>
  );
}
