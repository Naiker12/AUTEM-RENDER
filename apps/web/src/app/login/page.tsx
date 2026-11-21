"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Lock, Mail, User } from "lucide-react";
import { API_URL } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/register";
      const body = mode === "login" ? { email, password } : { email, name, password };
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail ?? `Error de autenticación (${res.status})`);
      }
      localStorage.setItem("autem_token", data.access_token);
      localStorage.setItem("autem_user", JSON.stringify(data.user));
      router.push("/projects");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticación");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center">
      <div className="space-y-6 rounded-[12px] border border-[#232326] bg-[#111113] p-6">
        <div>
          <h1 className="text-xl font-semibold text-[#F5F5F5]">
            {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </h1>
          <p className="mt-1 text-xs text-[#8A8A8F]">
            Accede a tus proyectos, escenas 3D y credenciales de Autem Render.
          </p>
        </div>

        {error && (
          <div className="rounded-[10px] border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <label className="block space-y-1">
              <span className="text-xs text-[#A1A1AA]">Nombre</span>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717A]" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full rounded-[10px] border border-[#2A2A2F] bg-[#0A0A0B] py-2 pl-9 pr-3 text-xs text-[#F5F5F5] outline-none focus:border-[#F97316]"
                />
              </div>
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-xs text-[#A1A1AA]">Correo electrónico</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717A]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="arquitecto@estudio.com"
                className="w-full rounded-[10px] border border-[#2A2A2F] bg-[#0A0A0B] py-2 pl-9 pr-3 text-xs text-[#F5F5F5] outline-none focus:border-[#F97316]"
              />
            </div>
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-[#A1A1AA]">Contraseña (mín. 8 caracteres)</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717A]" />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-[10px] border border-[#2A2A2F] bg-[#0A0A0B] py-2 pl-9 pr-3 text-xs text-[#F5F5F5] outline-none focus:border-[#F97316]"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex w-full items-center justify-center gap-2 rounded-[10px] py-2.5 text-xs font-semibold transition disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "login" ? "Entrar al estudio" : "Registrar cuenta"}
          </button>
        </form>

        <div className="border-t border-[#1E1E22] pt-4 text-center text-xs text-[#8A8A8F]">
          {mode === "login" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="font-medium text-[#F97316] hover:underline"
          >
            {mode === "login" ? "Crear una" : "Iniciar sesión"}
          </button>
        </div>
      </div>
    </div>
  );
}
