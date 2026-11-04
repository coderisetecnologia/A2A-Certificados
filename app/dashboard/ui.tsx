"use client";

import { useState } from "react";

export const card = "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
export const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:border-slate-700 dark:bg-slate-900";
export const btnPrimary =
  "rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50";
export const btnSecondary =
  "rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800";

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        });
      }}
    >
      {copiado ? "Copiado ✓" : label}
    </button>
  );
}

export function CodeBlock({ code, title }: { code: string; title?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{title ?? ""}</span>
        <CopyButton text={code} />
      </div>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-white p-3 font-mono text-xs dark:bg-slate-900">
        {code}
      </pre>
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "red" | "amber" | "brand" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    red: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    amber: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    brand: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300",
  };
  return <span className={`rounded px-2 py-0.5 font-mono text-xs ${tones[tone]}`}>{children}</span>;
}
