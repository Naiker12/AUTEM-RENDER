import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import "./globals.css";

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
  description: "Estudio de arquitectura con IA: Imagen a 3D, Render, Escena 3D y Video",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="flex min-h-screen bg-[#0A0A0B] text-[#F5F5F5] antialiased selection:bg-[#F97316]/30 selection:text-white">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="w-full flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
