"use client";

import { useEffect, useState } from "react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 font-bold text-white shadow-sm">CR</div>
      <div className="text-left leading-tight">
        <div className="font-semibold tracking-tight">CodeRise</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Suri × GFSIS</div>
      </div>
    </div>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // modo privado: ignora
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Alternar tema claro/escuro"
      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {dark === null ? "Tema" : dark ? "☀️ Claro" : "🌙 Escuro"}
    </button>
  );
}
