import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Geist } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Autem Render — AI Architecture Studio",
  description: "Estudio de arquitectura con IA: Imagen a 3D, Render, Escena 3D y Video (100% Gratis)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={cn("dark", inter.variable, jetbrainsMono.variable, "font-sans", geist.variable)}>
      <body className="flex min-h-screen bg-[#0A0A0B] text-[#F5F5F5] antialiased selection:bg-[#F97316]/30 selection:text-white">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="mx-auto w-full max-w-[1344px] flex-1 p-8">{children}</main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
