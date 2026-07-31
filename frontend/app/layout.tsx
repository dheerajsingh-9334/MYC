import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/components/QueryProvider";
import AppLayout from "@/components/layout/AppLayout";
import ToasterProvider from "@/components/ToasterProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "MyCOPS — Client Pipeline Platform",
  description: "Manage 100+ coaching clients through a 9-step operational pipeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <QueryProvider>
          <AppLayout>{children}</AppLayout>
          <ToasterProvider />
        </QueryProvider>
      </body>
    </html>
  );
}
